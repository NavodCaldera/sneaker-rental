import "server-only";
import { randomUUID } from "node:crypto";
import { D, toD } from "@/lib/decimal";
import { chargedAmounts, remainingValue } from "@/lib/pricing";
import { colomboDay, dayToDate } from "@/lib/wear-ledger";
import { merchantFundedDiscounts, merchantOwed, shoeCurve } from "../catalogue/pricing";
import { type Tx, db } from "../db";
import { getActiveSettings } from "../settings";
import { replan } from "../booking/plan";
import { cancelReservation } from "../booking/reservations";
import { flushEmails } from "../notify";
import { chargeFree, chargeFromDeposit, credit, unlockDeposit, unlockRental } from "../wallet";

export class PaymentError extends Error {}

/**
 * Rental money in tokens (pricing-spec.md §6–7). Booking locks the pairs' merchant value as
 * a deposit and charges the rent for the term; `settleRent` moves an item's rent to a new
 * amount whenever its plan changes, and to its final charge at close. Card payments happen
 * only when a borrower tops up or withdraws (src/server/wallet).
 */

/**
 * Move an item's rent paid to `target` (a 2-dp amount from the pricing engine): charge the
 * difference from the free balance, or credit it back. Returns the change (+ charged,
 * − refunded). Runs in the caller's transaction with the `rentPaid` update, so a retry
 * can't charge twice.
 */
export async function settleRent(
  tx: Tx,
  input: {
    userId: string;
    rentalId: string;
    itemId: string;
    rentPaid: D;
    target: D;
    note: { charge: string; refund: string };
  },
): Promise<D> {
  const delta = input.target.minus(input.rentPaid);
  if (delta.isZero()) return delta;
  const base = {
    userId: input.userId,
    rentalId: input.rentalId,
    rentalItemId: input.itemId,
    key: `rent:${input.itemId}:${randomUUID()}`,
  };
  if (delta.gt(0)) await chargeFree(tx, { ...base, amount: delta, note: input.note.charge });
  else await credit(tx, { ...base, amount: delta.neg(), note: input.note.refund });
  await tx.rentalItem.update({
    where: { id: input.itemId },
    data: { rentPaid: input.target.toFixed(2) },
  });
  return delta;
}

/**
 * Unlock a pair's deposit when its item no longer needs it (closed, or a cancelled
 * reservation). Until then the pair's full value stays locked (pricing-spec.md §6).
 */
export async function unlockPairValue(tx: Tx, itemId: string, note: string) {
  const item = await tx.rentalItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { rental: true },
  });
  await unlockDeposit(tx, {
    userId: item.rental.borrowerId,
    rentalId: item.rentalId,
    rentalItemId: item.id,
    key: `release:${item.id}`,
    note,
  });
}

/**
 * After a pair is back and inspected: unlock its deposit, unless a dispute on it is open
 * (the deposit stays locked to cover damage until an admin decides).
 */
async function releaseItem(tx: Tx, itemId: string) {
  const item = await tx.rentalItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { disputes: { where: { status: "OPEN" } } },
  });
  if (item.status !== "CLOSED" || item.disputes.length > 0) return;
  await unlockPairValue(tx, item.id, "Pair returned: value unlocked");
}

/**
 * §4 rule 1: settle each closed item to its final charge. Rent was paid at booking and
 * kept in step with the plan, so the difference is normally zero.
 */
export async function settleItems(itemIds: string[]) {
  const rentalIds = new Set<string>();
  for (const itemId of itemIds) {
    await db.$transaction(async (tx) => {
      const item = await tx.rentalItem.findUniqueOrThrow({
        where: { id: itemId },
        include: { rental: true },
      });
      if (item.status !== "CLOSED" || !item.charge) return;
      await settleRent(tx, {
        userId: item.rental.borrowerId,
        rentalId: item.rentalId,
        itemId: item.id,
        rentPaid: toD(item.rentPaid),
        target: toD(item.charge),
        note: { charge: "Rent: final", refund: "Rent: final, refund" },
      });
      await releaseItem(tx, item.id);
      rentalIds.add(item.rentalId);
    });
  }
  for (const rentalId of rentalIds) await finishRentalIfDone(rentalId);
}

/**
 * When every item is settled or cancelled and nothing is under dispute: unlock what is left
 * of the rental's tokens.
 */
export async function finishRentalIfDone(rentalId: string) {
  const rental = await db.rental.findUniqueOrThrow({
    where: { id: rentalId },
    include: { items: { include: { disputes: { where: { status: "OPEN" } } } } },
  });
  if (rental.status !== "CLOSED" && rental.status !== "CANCELLED") return false;
  if (rental.items.some((i) => i.disputes.length > 0)) return false;
  await db.$transaction(async (tx) => {
    for (const item of rental.items) await releaseItem(tx, item.id);
    await unlockRental(tx, {
      userId: rental.borrowerId,
      rentalId,
      key: `finish:${rentalId}`,
      note: "Rental closed: tokens unlocked",
    });
  });
  return true;
}

/**
 * An upheld damage claim: charge up to the pair's merchant value against that pair's
 * deposit (then the free balance). Returns the amount charged.
 */
export async function chargeDamage(itemId: string, amount: string, reason: string) {
  return db.$transaction(async (tx) => {
    const item = await tx.rentalItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { rental: true, shoe: true },
    });
    const take = D.min(new D(amount), toD(item.shoe.value));
    if (take.lte(0)) return new D(0);
    await chargeFromDeposit(tx, {
      userId: item.rental.borrowerId,
      rentalId: item.rentalId,
      rentalItemId: item.id,
      amount: take,
      key: `damage:${item.id}:${reason}`,
      note: "Damage",
    });
    return take;
  });
}

/** After a dispute is decided: unlock the pair's value and close out the rental if done. */
export async function releaseAfterDispute(itemId: string) {
  const item = await db.$transaction(async (tx) => {
    await releaseItem(tx, itemId);
    return tx.rentalItem.findUniqueOrThrow({ where: { id: itemId } });
  });
  await finishRentalIfDone(item.rentalId);
}

/**
 * §4 rule 3 / §6: a lost or unreturned pair. The borrower pays what the shoe had left to
 * earn (K · (A − IQ(w)), or R − collected with catch-up), split merchant first, charged
 * from that pair's deposit and then the free balance (which may go negative). The
 * rent prepaid for the term is refunded, since the remaining value replaces it. The
 * merchant is made whole, the shoe is retired, any reservation cancelled and the account
 * locked.
 */
export async function markLost(itemId: string, now = new Date()) {
  const settingsRow = await getActiveSettings(now);
  const cancelled: string[] = [];

  const item = await db.$transaction(async (tx) => {
    const item = await tx.rentalItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { shoe: { include: { settings: true } }, rental: { include: { items: true } } },
    });
    if (item.status !== "ACTIVE" && item.status !== "RETURNING") {
      throw new PaymentError("Only pairs a borrower holds can be marked lost");
    }
    const { params, settings, collected } = shoeCurve(item.shoe);
    const wStart = toD(item.shoe.wear);
    const owed = remainingValue(params, wStart, collected, settings);
    const { outstanding } = merchantOwed(item.shoe, await merchantFundedDiscounts(tx, item.shoeId));
    const { charge, merchantShare, platformShare } = chargedAmounts(owed, {
      merchantOutstanding: outstanding,
    });

    await tx.rentalItem.update({
      where: { id: item.id },
      data: {
        status: "LOST",
        endDate: item.endDate ?? now,
        lastDay: item.lastDay ?? dayToDate(colomboDay(now)),
        closedAt: now,
        payableAt: new Date(now.getTime() + settingsRow.disputeWindowDays * 86_400_000),
        wearStart: wStart.toString(),
        wearEnd: params.L.toString(),
        chargeExact: owed.toString(),
        discountCost: "0",
        charge: charge.toFixed(2),
        merchantShare: merchantShare.toFixed(2),
        platformShare: platformShare.toFixed(2),
      },
    });
    await tx.shoe.update({
      where: { id: item.shoeId },
      data: {
        wear: params.L.toString(),
        committedWear: params.L.toString(),
        collectedSoFar: toD(item.shoe.collectedSoFar).plus(owed).toString(),
        merchantCollected: toD(item.shoe.merchantCollected).plus(merchantShare).toFixed(2),
        status: "RETIRED",
        retiredAt: now,
      },
    });
    await tx.delivery.updateMany({
      where: {
        OR: [{ rentalItemId: item.id }, { fromRentalItemId: item.id }],
        status: { notIn: ["DELIVERED"] },
      },
      data: { status: "CANCELLED" },
    });
    await settleRent(tx, {
      userId: item.rental.borrowerId,
      rentalId: item.rentalId,
      itemId: item.id,
      rentPaid: toD(item.rentPaid),
      target: new D(0),
      note: { charge: "Rent", refund: "Lost pair: rent refunded" },
    });
    const queued = await tx.rentalItem.findMany({
      where: { shoeId: item.shoeId, status: "WAITING_HANDOFF" },
      select: { id: true, rentalId: true },
    });
    for (const q of queued) {
      await cancelReservation(tx, q.id, "the pair was lost", now);
      cancelled.push(q.rentalId);
    }
    // The borrower's other pairs no longer share their days with this one.
    await replan(tx, { borrowerIds: [item.rental.borrowerId] }, now, {
      actorId: item.rental.borrowerId,
      settings: settingsRow,
    });
    await tx.user.update({ where: { id: item.rental.borrowerId }, data: { locked: true } });
    const open = item.rental.items.filter(
      (i) => i.id !== item.id && !["CLOSED", "CANCELLED", "LOST"].includes(i.status),
    ).length;
    if (open === 0) {
      await tx.rental.update({
        where: { id: item.rentalId },
        data: { status: "CLOSED", closedAt: now },
      });
    }
    await chargeFromDeposit(tx, {
      userId: item.rental.borrowerId,
      rentalId: item.rentalId,
      rentalItemId: item.id,
      amount: charge,
      key: `lost:${item.id}`,
      note: "Lost pair: remaining value",
    });
    return item;
  });
  await finishRentalIfDone(item.rentalId);
  for (const rentalId of cancelled) await finishRentalIfDone(rentalId);
  await flushEmails(now);
  return db.rentalItem.findUniqueOrThrow({ where: { id: itemId } });
}

/**
 * §4 rule 6: the trip fee passes through to the ride-hailing app and we keep the booking
 * fee. Charged in tokens from the borrower's free balance when the trip is delivered, if
 * they pay; it never comes out of a pair's deposit.
 */
export async function chargeDeliveryFee(deliveryId: string) {
  const delivery = await db.delivery.findUniqueOrThrow({
    where: { id: deliveryId },
    include: { rentalItem: { include: { rental: true } } },
  });
  if (delivery.paidBy !== "BORROWER") return null;
  const total = toD(delivery.quote ?? 0).plus(toD(delivery.bookingFee ?? 0));
  if (total.lte(0)) return null;
  const rental = delivery.rentalItem.rental;
  await db.$transaction((tx) =>
    chargeFree(tx, {
      userId: rental.borrowerId,
      rentalId: rental.id,
      rentalItemId: delivery.rentalItemId,
      amount: total,
      key: `delivery:${delivery.id}`,
      note: `Delivery fee (${delivery.type.toLowerCase()})`,
    }),
  );
  return total;
}

/** Give back part of an item's charge as tokens (an upheld overcharge dispute). */
export async function refundItem(itemId: string, amount: string, reason: string) {
  const item = await db.rentalItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { rental: true },
  });
  if (!item.charge || item.charge.lte(0)) {
    throw new PaymentError("Nothing was charged for this pair");
  }
  const take = D.min(new D(amount), toD(item.charge));
  if (take.lte(0)) return null;
  await db.$transaction((tx) =>
    credit(tx, {
      userId: item.rental.borrowerId,
      rentalId: item.rentalId,
      rentalItemId: item.id,
      amount: take,
      key: `refund:${item.id}:${reason}`,
      note: "Refund of rent",
    }),
  );
  return take;
}
