import "server-only";
import { z } from "zod";
import type { RentalItemStatus } from "@/generated/prisma/client";
import { D, toD } from "@/lib/decimal";
import { formatDate } from "@/lib/format";
import { bundleDailyCost, catchUpPhi, shownPrice } from "@/lib/pricing";
import { atEndOfLife, dayToDate } from "@/lib/wear-ledger";
import { releaseInfo, shoeCurve } from "../catalogue/pricing";
import { db } from "../db";
import { requestDelivery } from "../logistics/requests";
import { flushEmails } from "../notify";
import { type SettingsRow, getActiveSettings } from "../settings";
import { WalletError, lockDeposit, walletBalance } from "../wallet";
import { BookingError } from "./errors";
import { asOfToday } from "./holdings";
import { type PlanItem, loadPlanItems, planItems, replan, toPlanItem } from "./plan";
import { handOffIfWaiting } from "./reservations";

export { BookingError };

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
  /** Price per wear-day at the wear the term starts from, after the release discount */
  priceToday: string;
  priceBeforeDiscount: string;
  /** Release discount locked in for this pair's whole rental (0 = none) */
  discount: string;
  /** Wear the term starts from: the pair's committed wear */
  wear: string;
  /** Wear once the term is used (shown as "used" as soon as it's paid) */
  wearEnd: string;
  lifespanDays: number;
  /** Expected day 1 and last day of the term */
  firstDay: Date;
  lastDay: Date;
  /** Rent for the term, paid at booking */
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
  /** Merchant value of the pairs (Σ V), locked as a deposit while they are out */
  shoeValue: string;
  /** Tokens needed: shoeValue + rent */
  required: string;
  /** The borrower's available tokens (null when signed out) */
  available: string | null;
  /** Tokens to top up before booking (0 if enough) */
  shortfall: string;
  /** Rent for the term, paid at booking */
  estimate: string;
  problems: string[];
};

/**
 * Prices a bundle for a term (pricing-spec.md §6): each pair's price at the wear its term
 * starts from, the bundle's daily cost (each pair accrues 1/n per day across all pairs held)
 * and the rent for the term. The rent comes from the same plan booking stores (`planItems`):
 * the borrower's other bookings over their own terms, each pair starting from its committed
 * wear. A pair whose last holder's release window has opened carries the release discount
 * for the day of booking.
 */
export async function quoteBundle(
  borrowerId: string | null,
  shoeIds: string[],
  plannedDays = DEFAULT_PLANNED_DAYS,
  settingsRow?: SettingsRow,
  now = new Date(),
): Promise<BundleQuote> {
  const row = settingsRow ?? (await getActiveSettings(now));
  const held = borrowerId ? await pairsHeld(borrowerId) : 0;
  const shoes = await db.shoe.findMany({
    where: { id: { in: shoeIds } },
    include: {
      settings: true,
      photos: { where: { kind: "FRONT" }, take: 1 },
      merchant: { select: { verified: true } },
      rentalItems: {
        where: { status: { in: ["WAITING_HANDOFF", "ACTIVE", "RETURNING"] } },
        select: {
          status: true,
          rental: { select: { borrowerId: true } },
          deliveries: {
            where: { type: "COLLECT", status: { not: "CANCELLED" } },
            select: { id: true },
          },
        },
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
  const today = asOfToday(now);
  const release = new Map(listed.map((s) => [s.id, releaseInfo(s, row, today)]));

  // Plan the new pairs alongside the borrower's bookings and each pair's queue.
  const { rows, shoes: planShoes } = await loadPlanItems(db, {
    borrowerIds: borrowerId ? [borrowerId] : [],
    shoeIds: listed.map((s) => s.id),
  });
  const me = borrowerId ?? "quote";
  const items: PlanItem[] = rows.map(toPlanItem);
  for (const shoe of listed) {
    items.push({
      id: `new:${shoe.id}`,
      borrowerId: me,
      shoeId: shoe.id,
      status: shoe.status === "WITH_BORROWER" ? "WAITING_HANDOFF" : "AWAITING_DELIVERY",
      createdAt: now,
      firstDay: null,
      lastDay: null,
      termEndDay: null,
      plannedDays,
      discount: release.get(shoe.id)!.discount,
      phi: new D(1),
    });
  }
  const plan = planItems(items, planShoes, today);

  const lines: QuoteLine[] = listed.map((shoe) => {
    const p = plan.items.get(`new:${shoe.id}`)!;
    const { params, settings, collected } = shoeCurve(shoe);
    const info = release.get(shoe.id)!;
    const phi = settings.catchUp ? catchUpPhi(params, collected, p.wearStart) : new D(1);
    const problem = lineProblem(shoe, borrowerId, info);
    if (problem) problems.push(`${shoe.brand} ${shoe.model}: ${problem}`);
    return {
      shoeId: shoe.id,
      brand: shoe.brand,
      model: shoe.model,
      size: shoe.size,
      photoId: shoe.photos[0]?.id,
      mode: shoe.status === "WITH_BORROWER" ? ("handoff" as const) : ("deliver" as const),
      priceToday: shownPrice(params, p.wearStart, info.discount, phi).toString(),
      priceBeforeDiscount: shownPrice(params, p.wearStart, 0, phi).toString(),
      discount: info.discount.toString(),
      wear: p.wearStart.toString(),
      wearEnd: p.wearEnd.toString(),
      lifespanDays: shoe.lifespanDays,
      firstDay: dayToDate(p.firstDay),
      lastDay: dayToDate(p.lastDay),
      estimate: p.charge.toFixed(2),
      problem,
    };
  });

  const estimate = lines.reduce((sum, l) => sum.plus(l.estimate), new D(0));
  // Needed at booking: the pairs' merchant value (locked) plus the rent (paid).
  const shoeValue = listed.reduce((sum, s) => sum.plus(toD(s.value)), new D(0));
  const required = shoeValue.plus(estimate);
  const available = borrowerId ? (await walletBalance(borrowerId)).available : null;
  const shortfall = available === null ? new D(0) : D.max(0, required.minus(available));
  if (shortfall.gt(0)) {
    problems.push(
      `Top up ${shortfall.toFixed(2)} tokens: you need ${required.toFixed(2)} available ` +
        `(pair values ${shoeValue.toFixed(2)} + rent ${estimate.toFixed(2)})`,
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
  committedWear: { toString(): string };
  lifespanDays: number;
  merchant: { verified: boolean };
  rentalItems: {
    status: RentalItemStatus;
    rental: { borrowerId: string };
    deliveries: { id: string }[];
  }[];
};

function lineProblem(
  shoe: ShoeForLine,
  borrowerId: string | null,
  release: { open: boolean; opensOn: number | null },
): string | undefined {
  if (!shoe.merchant.verified) return "not available";
  if (atEndOfLife(shoe.committedWear.toString(), shoe.lifespanDays)) return "at end of life";
  if (shoe.status === "AVAILABLE") return undefined;
  if (shoe.status !== "WITH_BORROWER") return "no longer available";
  if (shoe.rentalItems.some((i) => i.status === "WAITING_HANDOFF")) return "already reserved next";
  if (shoe.rentalItems.some((i) => i.status === "RETURNING" && i.deliveries.length > 0)) {
    return "on its way back to the merchant";
  }
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
 * Books a bundle for a term (§5.2 step 3, pricing-spec.md §6). Available pairs are reserved
 * and a delivery is requested; pairs held by another borrower join the handoff queue (and go
 * now if their holder has already ended and is waiting). In one transaction: each pair's
 * merchant value is locked as its own deposit, the term's rent is charged and the plan
 * stored, so each pair's wear is committed at once. A short balance books nothing.
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

  const rental = await db.$transaction(async (tx) => {
    const rental = await tx.rental.create({
      data: {
        borrowerId,
        status: "ACTIVE",
        deliveryAddress: input.deliveryAddress,
        prepaidRent: quote.estimate,
        shoeValue: quote.shoeValue,
      },
    });
    for (const line of quote.lines) {
      const terms = {
        plannedDays: input.plannedDays,
        discount: line.discount,
        // OPEN DECISION: who funds the release discount. The platform does for now, so the
        // merchant is still paid first; discounts beyond the platform's margin leave the
        // merchant short of their target.
        discountFunding: new D(line.discount).gt(0) ? ("PLATFORM" as const) : null,
      };
      let item: { id: string };
      if (line.mode === "deliver") {
        // Conditional update: fails if someone else reserved the pair in the meantime.
        const { count } = await tx.shoe.updateMany({
          where: { id: line.shoeId, status: "AVAILABLE" },
          data: { status: "RESERVED" },
        });
        if (count === 0) throw new BookingError(`${line.brand} ${line.model} was just taken`);
        const shoe = await tx.shoe.findUniqueOrThrow({ where: { id: line.shoeId } });
        item = await tx.rentalItem.create({
          data: { rentalId: rental.id, shoeId: line.shoeId, status: "AWAITING_DELIVERY", ...terms },
        });
        await requestDelivery(tx, {
          type: "DELIVER",
          rentalItemId: item.id,
          fromAddress: shoe.pickupAddress,
          toAddress: input.deliveryAddress,
        });
      } else {
        const taken = await tx.rentalItem.count({
          where: { shoeId: line.shoeId, status: "WAITING_HANDOFF" },
        });
        if (taken > 0)
          throw new BookingError(`${line.brand} ${line.model} is already reserved next`);
        item = await tx.rentalItem.create({
          data: { rentalId: rental.id, shoeId: line.shoeId, status: "WAITING_HANDOFF", ...terms },
        });
      }
      // Each pair's value is its own deposit, locked until the pair is back and settled.
      const { value } = await tx.shoe.findUniqueOrThrow({ where: { id: line.shoeId } });
      try {
        await lockDeposit(tx, {
          userId: borrowerId,
          rentalId: rental.id,
          rentalItemId: item.id,
          amount: toD(value),
        });
      } catch (e) {
        if (e instanceof WalletError) throw new BookingError(e.message);
        throw e;
      }
    }

    // Charge the term's rent and commit the wear; the borrower's other bookings are settled
    // to the new overlap.
    await replan(tx, { borrowerIds: [borrowerId] }, now, {
      actorId: borrowerId,
      settings: settingsRow,
    });
    const { available } = await walletBalance(borrowerId, tx);
    if (available.lt(0)) {
      throw new BookingError(`Top up ${available.neg().toFixed(2)} tokens to book this bundle`);
    }
    const paid = await tx.rentalItem.aggregate({
      where: { rentalId: rental.id },
      _sum: { rentPaid: true },
    });
    for (const line of quote.lines) {
      if (line.mode === "handoff") await handOffIfWaiting(tx, line.shoeId);
    }
    return tx.rental.update({
      where: { id: rental.id },
      data: { prepaidRent: toD(paid._sum.rentPaid ?? 0).toFixed(2) },
    });
  });
  await flushEmails(now);
  return rental;
}
