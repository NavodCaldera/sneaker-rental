import "server-only";
import { z } from "zod";
import type { RentalItemStatus } from "@/generated/prisma/client";
import { D, toD } from "@/lib/decimal";
import { bundleDailyCost, shownPrice } from "@/lib/pricing";
import { formatDate } from "@/lib/format";
import {
  type LedgerItem,
  type LedgerShoe,
  atEndOfLife,
  dayToDate,
  estimate as ledgerEstimate,
} from "@/lib/wear-ledger";
import {
  type PricedShoe,
  merchantOwed,
  nextPhi,
  releaseInfo,
  shoeCurve,
} from "../catalogue/pricing";
import { db } from "../db";
import { requestDelivery } from "../logistics/requests";
import { WalletError, lockForRental, walletBalance } from "../wallet";
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
  /** Price per wear-day after the release discount */
  priceToday: string;
  priceBeforeDiscount: string;
  /** Release discount locked in for this pair's whole rental (0 = none) */
  discount: string;
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
  /** Merchant value of the pairs (Σ V), locked while they are out */
  shoeValue: string;
  /** Tokens to lock: shoeValue + estimate */
  required: string;
  /** The borrower's available tokens (null when signed out) */
  available: string | null;
  /** Tokens to top up before booking (0 if enough) */
  shortfall: string;
  estimate: string;
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
 * borrower already holds as held throughout (pricing-spec.md "Booking"). A pair whose last
 * holder's release window has opened carries the release discount for the day of booking.
 */
export async function quoteBundle(
  borrowerId: string | null,
  shoeIds: string[],
  plannedDays = DEFAULT_PLANNED_DAYS,
  settingsRow?: SettingsRow,
  now = new Date(),
): Promise<BundleQuote> {
  const row = settingsRow ?? (await getActiveSettings(now));
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
  const first = asOfToday(now);
  const last = first + plannedDays - 1;
  const release = new Map(listed.map((s) => [s.id, releaseInfo(s, row, first)]));
  const ledgerShoes = new Map<string, LedgerShoe>();
  const owedByKey = new Map<string, D>();
  const ledgerItems: LedgerItem[] = [];
  const plan = (key: string, shoe: PricedShoe, discount: D) => {
    ledgerShoes.set(key, ledgerShoe(key, shoe));
    owedByKey.set(key, merchantOwed(shoe).outstanding);
    ledgerItems.push({ id: key, borrowerId: "me", shoeId: key, start: first, end: last, discount });
  };
  for (const h of heldItems) plan(`held:${h.id}`, h.shoe, toD(h.discount));
  for (const shoe of listed) plan(`new:${shoe.id}`, shoe, release.get(shoe.id)!.discount);
  const invoice = ledgerEstimate(ledgerItems, ledgerShoes, (key) => owedByKey.get(key)!, {
    maxPairs: Math.max(row.maxPairsPerBundle, totalPairs),
  });
  const estimateFor = (shoeId: string) => invoice.lines.find((l) => l.shoeId === `new:${shoeId}`)!;

  const lines: QuoteLine[] = listed.map((shoe) => {
    const { params } = shoeCurve(shoe);
    const wear = toD(shoe.wear);
    const info = release.get(shoe.id)!;
    const phi = nextPhi(shoe);
    const problem = lineProblem(shoe, borrowerId, info);
    if (problem) problems.push(`${shoe.brand} ${shoe.model}: ${problem}`);
    return {
      shoeId: shoe.id,
      brand: shoe.brand,
      model: shoe.model,
      size: shoe.size,
      photoId: shoe.photos[0]?.id,
      mode: shoe.status === "WITH_BORROWER" ? ("handoff" as const) : ("deliver" as const),
      priceToday: shownPrice(params, wear, info.discount, phi).toString(),
      priceBeforeDiscount: shownPrice(params, wear, 0, phi).toString(),
      discount: info.discount.toString(),
      wear: wear.toString(),
      lifespanDays: shoe.lifespanDays,
      estimate: estimateFor(shoe.id).charge.toFixed(2),
      problem,
    };
  });

  const estimate = lines.reduce((sum, l) => sum.plus(l.estimate), new D(0));
  // Minimum balance: the pairs' merchant value plus the rent estimate, locked at booking.
  const shoeValue = listed.reduce((sum, s) => sum.plus(toD(s.value)), new D(0));
  const required = shoeValue.plus(estimate);
  const available = borrowerId ? (await walletBalance(borrowerId)).available : null;
  const shortfall = available === null ? new D(0) : D.max(0, required.minus(available));
  if (shortfall.gt(0)) {
    problems.push(
      `Top up ${shortfall.toFixed(2)} tokens: you need ${required.toFixed(2)} available ` +
        `(pair values ${shoeValue.toFixed(2)} + rent estimate ${estimate.toFixed(2)})`,
    );
  }
  return {
    lines,
    pairsHeld: held,
    totalPairs,
    maxPairs: row.maxPairsPerBundle,
    plannedDays,
    dailyCost: bundleDailyCost(lines.map((l) => l.priceToday)).toString(),
    estimate: estimate.toFixed(2),
    shoeValue: shoeValue.toFixed(2),
    required: required.toFixed(2),
    available: available?.toFixed(2) ?? null,
    shortfall: shortfall.toFixed(2),
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

function lineProblem(
  shoe: ShoeForLine,
  borrowerId: string | null,
  release: { open: boolean; opensOn: number | null },
): string | undefined {
  if (!shoe.merchant.verified) return "not available";
  if (atEndOfLife(shoe.wear.toString(), shoe.lifespanDays)) return "at end of life";
  if (shoe.status === "AVAILABLE") return undefined;
  if (shoe.status !== "WITH_BORROWER") return "no longer available";
  if (shoe.rentalItems.some((i) => i.status === "WAITING_HANDOFF")) return "already reserved next";
  // A held pair opens for the next borrower in its holder's release window (§8).
  if (!release.open) {
    return release.opensOn === null
      ? "not open for reservations"
      : `opens for reservations on ${formatDate(dayToDate(release.opensOn))}`;
  }
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
 * pairs held by another borrower join the handoff queue. Each item keeps its planned days
 * (its release day) and the release discount of the day of booking. The pairs' merchant
 * value plus the rent estimate is locked from the borrower's tokens in the same
 * transaction, so a short balance books nothing.
 */
export async function checkout(
  borrowerId: string,
  shoeIds: string[],
  input: z.infer<typeof checkoutSchema>,
  now = new Date(),
) {
  const unique = [...new Set(shoeIds)];
  if (unique.length === 0) throw new BookingError("Your bundle is empty");
  const borrower = await db.user.findUniqueOrThrow({ where: { id: borrowerId } });
  if (borrower.role !== "BORROWER") throw new BookingError("Only borrowers can rent");
  if (borrower.locked) throw new BookingError("Your account is locked");

  const settingsRow = await getActiveSettings(now);
  const quote = await quoteBundle(borrowerId, unique, input.plannedDays, settingsRow, now);
  if (quote.lines.length !== unique.length)
    throw new BookingError("Some pairs are no longer listed");
  if (quote.problems.length) throw new BookingError(quote.problems[0]);

  return db.$transaction(async (tx) => {
    const rental = await tx.rental.create({
      data: {
        borrowerId,
        status: "ACTIVE",
        deliveryAddress: input.deliveryAddress,
        estimate: quote.estimate,
        shoeValue: quote.shoeValue,
      },
    });
    try {
      await lockForRental(tx, borrowerId, rental.id, new D(quote.required));
    } catch (e) {
      if (e instanceof WalletError) throw new BookingError(e.message);
      throw e;
    }

    for (const line of quote.lines) {
      const terms = {
        plannedDays: input.plannedDays,
        discount: line.discount,
        // OPEN DECISION: who funds the release discount. The platform does for now, so the
        // merchant is still paid first; discounts beyond the platform's margin leave the
        // merchant short of their target.
        discountFunding: new D(line.discount).gt(0) ? ("PLATFORM" as const) : null,
      };
      if (line.mode === "deliver") {
        // Conditional update: fails if someone else reserved the pair in the meantime.
        const { count } = await tx.shoe.updateMany({
          where: { id: line.shoeId, status: "AVAILABLE" },
          data: { status: "RESERVED" },
        });
        if (count === 0) throw new BookingError(`${line.brand} ${line.model} was just taken`);
        const shoe = await tx.shoe.findUniqueOrThrow({ where: { id: line.shoeId } });
        const item = await tx.rentalItem.create({
          data: { rentalId: rental.id, shoeId: line.shoeId, status: "AWAITING_DELIVERY", ...terms },
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
          data: { rentalId: rental.id, shoeId: line.shoeId, status: "WAITING_HANDOFF", ...terms },
        });
      }
    }
    return rental;
  });
}
