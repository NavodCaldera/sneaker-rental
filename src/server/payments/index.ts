import "server-only";
import { D, toD } from "@/lib/decimal";
import { chargedAmounts, remainingValue } from "@/lib/pricing";
import { colomboDay, dayToDate } from "@/lib/wear-ledger";
import { merchantFundedDiscounts, merchantOwed, shoeCurve } from "../catalogue/pricing";
import { type Tx, db } from "../db";
import { getActiveSettings } from "../settings";
import { chargeRental, credit, unlockRental } from "../wallet";

export class PaymentError extends Error {}

/**
 * Rental money in tokens (pricing-spec.md §6–7). Booking locks the pairs' merchant value
 * plus the rent estimate; each charge here is taken from those locked tokens first. Card
 * payments happen only when a borrower tops up or withdraws (src/server/wallet).
 */

/**
 * After a pair is returned: unlock its merchant value, unless a dispute on it is open
 * (the value stays locked to cover damage until an admin decides).
 */
async function releaseItem(tx: Tx, itemId: string) {
  const item = await tx.rentalItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { rental: true, shoe: true, disputes: { where: { status: "OPEN" } } },
  });
  if (item.status !== "CLOSED" || item.disputes.length > 0) return;
  await unlockRental(tx, {
    userId: item.rental.borrowerId,
    rentalId: item.rentalId,
    rentalItemId: item.id,
    amount: toD(item.shoe.value),
    key: `release:${item.id}`,
    note: "Pair returned: value unlocked",
  });
}

/** §4 rule 1: charge each closed item's rent at return, from the amount booking computed. */
export async function settleItems(itemIds: string[]) {
  const rentalIds = new Set<string>();
  for (const itemId of itemIds) {
    await db.$transaction(async (tx) => {
      const item = await tx.rentalItem.findUniqueOrThrow({
        where: { id: itemId },
        include: { rental: true },
      });
      if (item.status !== "CLOSED" || !item.charge) return;
      await chargeRental(tx, {
        userId: item.rental.borrowerId,
        rentalId: item.rentalId,
        rentalItemId: item.id,
        amount: toD(item.charge),
        key: `rent:${item.id}`,
        note: "Rent",
      });
      await releaseItem(tx, item.id);
      rentalIds.add(item.rentalId);
    });
  }
  for (const rentalId of rentalIds) await finishRentalIfDone(rentalId);
}

/**
 * When every item is settled and nothing is under dispute: unlock what is left of the
 * rental's tokens (the unused rent estimate) and clear any top-up request.
 */
export async function finishRentalIfDone(rentalId: string) {
  const rental = await db.rental.findUniqueOrThrow({
    where: { id: rentalId },
    include: { items: { include: { disputes: { where: { status: "OPEN" } } } } },
  });
  if (rental.status !== "CLOSED") return false;
  if (rental.items.some((i) => i.disputes.length > 0)) return false;
  await db.$transaction(async (tx) => {
    for (const item of rental.items) await releaseItem(tx, item.id);
    await unlockRental(tx, {
      userId: rental.borrowerId,
      rentalId,
      amount: "all",
      key: `finish:${rentalId}`,
      note: "Rental closed: tokens unlocked",
    });
    await tx.rental.update({
      where: { id: rentalId },
      data: { topUpDueAt: null, topUpAmount: null },
    });
  });
  return true;
}

/**
 * An upheld damage claim: charge up to the pair's merchant value from the borrower's
 * locked tokens (then the free balance). Returns the amount charged.
 */
export async function chargeDamage(itemId: string, amount: string, reason: string) {
  return db.$transaction(async (tx) => {
    const item = await tx.rentalItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { rental: true, shoe: true },
    });
    const take = D.min(new D(amount), toD(item.shoe.value));
    if (take.lte(0)) return new D(0);
    await chargeRental(tx, {
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
 * from the rental's locked tokens and then the free balance (which may go negative). The
 * merchant is made whole, the shoe is retired and the account locked.
 */
export async function markLost(itemId: string, now = new Date()) {
  const settingsRow = await getActiveSettings(now);

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
    await tx.rentalItem.updateMany({
      where: { shoeId: item.shoeId, status: "WAITING_HANDOFF" },
      data: { status: "CANCELLED" },
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
    await chargeRental(tx, {
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
  return db.rentalItem.findUniqueOrThrow({ where: { id: itemId } });
}

/**
 * §4 rule 6: the trip fee passes through to the ride-hailing app and we keep the booking
 * fee. Charged in tokens to the borrower's rental when the trip is delivered, if they pay.
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
    chargeRental(tx, {
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
