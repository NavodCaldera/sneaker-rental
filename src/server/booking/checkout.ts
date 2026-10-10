import "server-only";
import { z } from "zod";
import type { RentalItemStatus } from "@/generated/prisma/client";
import { D, toD } from "@/lib/decimal";
import { type PricingSettings, bundleDailyCost, shownPrice } from "@/lib/pricing";
import {
  type LedgerItem,
  type LedgerShoe,
  atEndOfLife,
  estimate as ledgerEstimate,
} from "@/lib/wear-ledger";
import { type PricedShoe, nextPhi, shoeCurve } from "../catalogue/pricing";
import { db } from "../db";
import { requestDelivery } from "../logistics/requests";
import { PaymentError, authorizeRental } from "../payments";
import { type SettingsRow, getActiveSettings } from "../settings";
import { asOfToday } from "./holdings";

export class BookingError extends Error {}

/** Items that count toward the "hold up to N pairs at once" cap. */
export const HELD_STATUSES: RentalItemStatus[] = ["AWAITING_DELIVERY", "WAITING_HANDOFF", "ACTIVE"];

export const DEFAULT_PLANNED_DAYS = 14;

export async function pairsHeld(borrowerId: string) {
  return db.rentalItem.count({ where: { rental: { borrowerId }, status: { in: HELD_STATUSES } } });
}

export type QuoteLine = {
  shoeId: string;
  brand: string;
  model: string;
  size: string;
  photoId?: string;
  mode: "deliver" | "handoff";
  priceToday: string;
  wear: string;
  lifespanDays: number;
  estimate: string;
  problem?: string;
};

export type BundleQuote = {
  lines: QuoteLine[];
  pairsHeld: number;
  totalPairs: number;
  maxPairs: number;
  plannedDays: number;
  dailyCost: string;
  estimate: string;
  deposit: string;
  problems: string[];
};

function ledgerShoe(id: string, shoe: PricedShoe): LedgerShoe {
  const { params, settings, collected } = shoeCurve(shoe);
  return {
    id,
    curve: params,
    wear: toD(shoe.wear),
    collected,
    lostToDiscounts: new D(0),
    catchUp: settings.catchUp,
  };
}

/**
 * Prices a bundle: today's price per pair, the bundle's daily cost (each pair accrues 1/n
 * per day across all pairs held), the pre-auth estimate and the deposit. The estimate runs
 * the wear ledger on copies of the shoes over the planned days, counting the pairs the
 * borrower already holds as held throughout (pricing-spec.md "Booking").
 */
export async function quoteBundle(
  borrowerId: string | null,
  shoeIds: string[],
  plannedDays = DEFAULT_PLANNED_DAYS,
  settingsRow?: SettingsRow,
): Promise<BundleQuote> {
  const row = settingsRow ?? (await getActiveSettings());
  const heldItems = borrowerId
    ? await db.rentalItem.findMany({
        where: { rental: { borrowerId }, status: { in: HELD_STATUSES } },
        include: { shoe: { include: { settings: true } } },
      })
    : [];
  const held = heldItems.length;
  const shoes = await db.shoe.findMany({
    where: { id: { in: shoeIds } },
    include: {
      settings: true,
      photos: { where: { kind: "FRONT" }, take: 1 },
      merchant: { select: { verified: true } },
      rentalItems: {
        where: { status: { in: ["WAITING_HANDOFF", "ACTIVE", "RETURNING"] } },
        select: { status: true, rental: { select: { borrowerId: true } } },
      },
    },
  });
  const totalPairs = held + shoes.length;
  const problems: string[] = [];
  if (totalPairs > row.maxPairsPerBundle) {
    problems.push(
      `You can hold up to ${row.maxPairsPerBundle} pairs at once` +
        (held ? ` (you already hold ${held})` : ""),
    );
  }

  const listed = shoeIds.flatMap((id) => shoes.filter((s) => s.id === id));

  // Planned days: from today through today + plannedDays − 1, both inclusive.
  const first = asOfToday();
  const last = first + plannedDays - 1;
  const ledgerShoes = new Map<string, LedgerShoe>();
  const settingsByKey = new Map<string, PricingSettings>();
  const ledgerItems: LedgerItem[] = [];
  const plan = (key: string, shoe: PricedShoe) => {
    ledgerShoes.set(key, ledgerShoe(key, shoe));
    settingsByKey.set(key, shoeCurve(shoe).settings);
    ledgerItems.push({ id: key, borrowerId: "me", shoeId: key, start: first, end: last });
  };
  for (const h of heldItems) plan(`held:${h.id}`, h.shoe);
  for (const shoe of listed) plan(`new:${shoe.id}`, shoe);
  const invoice = ledgerEstimate(ledgerItems, ledgerShoes, (key) => settingsByKey.get(key)!, {
    maxPairs: Math.max(row.maxPairsPerBundle, totalPairs),
  });
  const estimateFor = (shoeId: string) => invoice.lines.find((l) => l.shoeId === `new:${shoeId}`)!;

  const lines: QuoteLine[] = listed.map((shoe) => {
    const { params } = shoeCurve(shoe);
    const wear = toD(shoe.wear);
    const problem = lineProblem(shoe, borrowerId);
    if (problem) problems.push(`${shoe.brand} ${shoe.model}: ${problem}`);
    return {
      shoeId: shoe.id,
      brand: shoe.brand,
      model: shoe.model,
      size: shoe.size,
      photoId: shoe.photos[0]?.id,
      mode: shoe.status === "WITH_BORROWER" ? ("handoff" as const) : ("deliver" as const),
      priceToday: shownPrice(params, wear, 0, nextPhi(shoe)).toString(),
      wear: wear.toString(),
      lifespanDays: shoe.lifespanDays,
      estimate: estimateFor(shoe.id).charge.toFixed(2),
      problem,
    };
  });

  const estimate = lines.reduce((sum, l) => sum.plus(l.estimate), new D(0));
  return {
    lines,
    pairsHeld: held,
    totalPairs,
    maxPairs: row.maxPairsPerBundle,
    plannedDays,
    dailyCost: bundleDailyCost(lines.map((l) => l.priceToday)).toString(),
    estimate: estimate.toFixed(2),
    deposit: toD(row.depositPerPair).times(lines.length).toFixed(2),
    problems,
  };
}

type ShoeForLine = {
  status: string;
  wear: { toString(): string };
  lifespanDays: number;
  merchant: { verified: boolean };
  rentalItems: { status: RentalItemStatus; rental: { borrowerId: string } }[];
};

function lineProblem(shoe: ShoeForLine, borrowerId: string | null): string | undefined {
  if (!shoe.merchant.verified) return "not available";
  if (atEndOfLife(shoe.wear.toString(), shoe.lifespanDays)) return "at end of life";
  if (shoe.status === "AVAILABLE") return undefined;
  if (shoe.status !== "WITH_BORROWER") return "no longer available";
  if (shoe.rentalItems.some((i) => i.status === "WAITING_HANDOFF")) return "already reserved next";
  if (borrowerId && shoe.rentalItems.some((i) => i.rental.borrowerId === borrowerId)) {
    return "you're holding this pair";
  }
  return undefined;
}

export const checkoutSchema = z.object({
  deliveryAddress: z.string().trim().min(5, "Enter a delivery address").max(300),
  plannedDays: z.coerce.number().int().min(1).max(365),
});

/**
 * Books a bundle (§5.2 step 3). Available pairs are reserved and a delivery is requested;
 * pairs held by another borrower join the handoff queue. Payment (pre-auth + deposit) is
 * attached by the payments module.
 */
export async function checkout(
  borrowerId: string,
  shoeIds: string[],
  input: z.infer<typeof checkoutSchema>,
) {
  const unique = [...new Set(shoeIds)];
  if (unique.length === 0) throw new BookingError("Your bundle is empty");
  const borrower = await db.user.findUniqueOrThrow({ where: { id: borrowerId } });
  if (borrower.role !== "BORROWER") throw new BookingError("Only borrowers can rent");
  if (borrower.locked) throw new BookingError("Your account is locked");

  const settingsRow = await getActiveSettings();
  const quote = await quoteBundle(borrowerId, unique, input.plannedDays, settingsRow);
  if (quote.lines.length !== unique.length)
    throw new BookingError("Some pairs are no longer listed");
  if (quote.problems.length) throw new BookingError(quote.problems[0]);

  const rental = await db.$transaction(async (tx) => {
    const rental = await tx.rental.create({
      data: {
        borrowerId,
        status: "PENDING_PAYMENT",
        deliveryAddress: input.deliveryAddress,
        estimate: quote.estimate,
        depositAmount: quote.deposit,
      },
    });

    for (const line of quote.lines) {
      if (line.mode === "deliver") {
        // Conditional update: fails if someone else reserved the pair in the meantime.
        const { count } = await tx.shoe.updateMany({
          where: { id: line.shoeId, status: "AVAILABLE" },
          data: { status: "RESERVED" },
        });
        if (count === 0) throw new BookingError(`${line.brand} ${line.model} was just taken`);
        const shoe = await tx.shoe.findUniqueOrThrow({ where: { id: line.shoeId } });
        const item = await tx.rentalItem.create({
          data: { rentalId: rental.id, shoeId: line.shoeId, status: "AWAITING_DELIVERY" },
        });
        await requestDelivery(tx, {
          type: "DELIVER",
          rentalItemId: item.id,
          fromAddress: shoe.pickupAddress,
          toAddress: input.deliveryAddress,
          bookingFee: settingsRow.deliveryBookingFee?.toString() ?? null,
        });
      } else {
        const taken = await tx.rentalItem.count({
          where: { shoeId: line.shoeId, status: "WAITING_HANDOFF" },
        });
        if (taken > 0)
          throw new BookingError(`${line.brand} ${line.model} is already reserved next`);
        await tx.rentalItem.create({
          data: { rentalId: rental.id, shoeId: line.shoeId, status: "WAITING_HANDOFF" },
        });
      }
    }
    return rental;
  });

  try {
    return await authorizeRental(rental.id);
  } catch (e) {
    if (!(e instanceof PaymentError)) throw e;
    await cancelRental(rental.id);
    throw new BookingError(`Payment failed: ${e.message}`);
  }
}

/** Undo a booking whose payment failed: free the pairs and cancel its deliveries. */
export async function cancelRental(rentalId: string) {
  await db.$transaction(async (tx) => {
    const items = await tx.rentalItem.findMany({ where: { rentalId } });
    for (const item of items) {
      if (item.status === "AWAITING_DELIVERY") {
        await tx.shoe.updateMany({
          where: { id: item.shoeId, status: "RESERVED" },
          data: { status: "AVAILABLE" },
        });
      }
    }
    await tx.delivery.updateMany({
      where: { rentalItem: { rentalId } },
      data: { status: "CANCELLED" },
    });
    await tx.rentalItem.updateMany({ where: { rentalId }, data: { status: "CANCELLED" } });
    await tx.rental.update({ where: { id: rentalId }, data: { status: "CANCELLED" } });
  });
}
