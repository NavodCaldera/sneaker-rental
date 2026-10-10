import "server-only";
import type { PaymentKind } from "@/generated/prisma/client";
import { D, roundMoney, toD } from "@/lib/decimal";
import { chargedAmounts, remainingValue } from "@/lib/pricing";
import { colomboDay, dayToDate } from "@/lib/wear-ledger";
import { shoeCurve } from "../catalogue/pricing";
import { db } from "../db";
import { getActiveSettings } from "../settings";
import { type GatewayResult, gateway } from "./gateway";

export class PaymentError extends Error {}

/**
 * Runs one gateway call at most once per idempotency key and records it as a Payment row.
 * A repeated call with a key that already succeeded returns the stored row.
 */
async function recordPayment(
  input: {
    kind: PaymentKind;
    rentalId: string;
    rentalItemId?: string;
    amount: string;
    key: string;
    note?: string;
  },
  call: () => Promise<GatewayResult>,
) {
  const existing = await db.payment.findUnique({ where: { idempotencyKey: input.key } });
  if (existing?.status === "SUCCEEDED") return existing;
  const result = await call();
  const data = {
    kind: input.kind,
    rentalId: input.rentalId,
    rentalItemId: input.rentalItemId,
    amount: input.amount,
    gateway: gateway().name,
    gatewayRef: result.ok ? result.ref : null,
    status: result.ok ? ("SUCCEEDED" as const) : ("FAILED" as const),
    note: result.ok ? input.note : result.error,
  };
  const row = existing
    ? await db.payment.update({ where: { id: existing.id }, data })
    : await db.payment.create({ data: { ...data, idempotencyKey: input.key } });
  if (!result.ok) throw new PaymentError(result.error);
  return row;
}

/** §4 rule 1–2: pre-authorise the estimate and hold the deposit, then activate the rental. */
export async function authorizeRental(rentalId: string) {
  const rental = await db.rental.findUniqueOrThrow({ where: { id: rentalId } });
  const auth = await recordPayment(
    { kind: "PREAUTH", rentalId, amount: rental.estimate.toFixed(2), key: `preauth:${rentalId}` },
    () => gateway().preAuthorise(rental.estimate.toFixed(2), `preauth:${rentalId}`),
  );
  const hold = await recordPayment(
    {
      kind: "DEPOSIT_HOLD",
      rentalId,
      amount: rental.depositAmount.toFixed(2),
      key: `deposit:${rentalId}`,
    },
    () => gateway().preAuthorise(rental.depositAmount.toFixed(2), `deposit:${rentalId}`),
  );
  return db.rental.update({
    where: { id: rentalId },
    data: { status: "ACTIVE", preAuthRef: auth.gatewayRef, depositHoldRef: hold.gatewayRef },
  });
}

/** §4 rule 1: charge each closed item at return, from the amount booking computed. */
export async function settleItems(itemIds: string[]) {
  const rentalIds = new Set<string>();
  for (const itemId of itemIds) {
    const item = await db.rentalItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { rental: true },
    });
    if ((item.status !== "CLOSED" && item.status !== "LOST") || !item.charge) continue;
    if (item.charge.gt(0)) {
      const amount = item.charge.toFixed(2);
      await recordPayment(
        {
          kind: "CAPTURE",
          rentalId: item.rentalId,
          rentalItemId: item.id,
          amount,
          key: `capture:${item.id}`,
        },
        () => gateway().capture(item.rental.preAuthRef ?? "", amount, `capture:${item.id}`),
      );
    }
    rentalIds.add(item.rentalId);
  }
  for (const rentalId of rentalIds) await finishRentalIfDone(rentalId);
}

/**
 * When every item is closed and nothing is under dispute: release the deposit hold and
 * void what's left of the pre-authorisation (§4 rule 2).
 */
export async function finishRentalIfDone(rentalId: string) {
  const rental = await db.rental.findUniqueOrThrow({
    where: { id: rentalId },
    include: { items: { include: { disputes: { where: { status: "OPEN" } } } }, payments: true },
  });
  if (rental.status !== "CLOSED") return false;
  if (rental.items.some((i) => i.disputes.length > 0)) return false;
  if (rental.payments.some((p) => p.kind === "DEPOSIT_RELEASE" && p.status === "SUCCEEDED"))
    return true;

  const captured = rental.payments
    .filter((p) => p.kind === "DEPOSIT_CAPTURE" && p.status === "SUCCEEDED")
    .reduce((sum, p) => sum.plus(toD(p.amount)), new D(0));
  const released = toD(rental.depositAmount).minus(captured);
  await recordPayment(
    {
      kind: "DEPOSIT_RELEASE",
      rentalId,
      amount: roundMoney(released).toFixed(2),
      key: `deposit-release:${rentalId}`,
    },
    () => gateway().void(rental.depositHoldRef ?? "", `deposit-release:${rentalId}`),
  );
  await recordPayment(
    { kind: "PREAUTH_VOID", rentalId, amount: "0.00", key: `preauth-void:${rentalId}` },
    () => gateway().void(rental.preAuthRef ?? "", `preauth-void:${rentalId}`),
  );
  return true;
}

/** Capture up to `amount` from a rental's deposit hold (damage or loss). */
export async function captureFromDeposit(
  rentalId: string,
  rentalItemId: string,
  amount: string,
  reason: string,
) {
  const rental = await db.rental.findUniqueOrThrow({
    where: { id: rentalId },
    include: { payments: true },
  });
  const already = rental.payments
    .filter((p) => p.kind === "DEPOSIT_CAPTURE" && p.status === "SUCCEEDED")
    .reduce((sum, p) => sum.plus(toD(p.amount)), new D(0));
  const available = toD(rental.depositAmount).minus(already);
  const take = D.min(new D(amount), available);
  if (take.lte(0)) return null;
  const key = `deposit-capture:${rentalItemId}:${reason}`;
  return recordPayment(
    { kind: "DEPOSIT_CAPTURE", rentalId, rentalItemId, amount: take.toFixed(2), key, note: reason },
    () => gateway().capture(rental.depositHoldRef ?? "", take.toFixed(2), key),
  );
}

/**
 * §4 rule 3 / §6: a lost or unreturned pair. The borrower pays what the shoe had left to
 * earn (K · (A − IQ(w)), or R − collected with catch-up), split as normal; the deposit is
 * captured first and the card is charged the rest. The merchant is made whole, the shoe is
 * retired and the account locked.
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
    const { charge, merchantShare, platformShare } = chargedAmounts(settings, owed);

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
    return { ...item, charge, pairs: item.rental.items.length };
  });

  // Deposit first: this pair's share of the deposit, then the card for the rest.
  const rental = await db.rental.findUniqueOrThrow({ where: { id: item.rentalId } });
  const depositShare = toD(rental.depositAmount).div(item.pairs);
  const fromDeposit = await captureFromDeposit(
    item.rentalId,
    item.id,
    D.min(depositShare, item.charge).toFixed(2),
    "lost",
  );
  const rest = item.charge.minus(fromDeposit ? toD(fromDeposit.amount) : 0);
  if (rest.gt(0)) {
    await recordPayment(
      {
        kind: "CAPTURE",
        rentalId: item.rentalId,
        rentalItemId: item.id,
        amount: rest.toFixed(2),
        key: `capture:${item.id}`,
        note: "Lost pair: remaining value after deposit",
      },
      () => gateway().capture(rental.preAuthRef ?? "", rest.toFixed(2), `capture:${item.id}`),
    );
  }
  await finishRentalIfDone(item.rentalId);
  return db.rentalItem.findUniqueOrThrow({ where: { id: itemId } });
}

/** Payment rows for a rental, oldest first, for receipts. */
export async function rentalPayments(rentalId: string) {
  return db.payment.findMany({ where: { rentalId }, orderBy: { createdAt: "asc" } });
}

/**
 * §4 rule 6: the trip fee passes through to the ride-hailing app and we keep the booking
 * fee. Charged to the borrower's rental when the trip is delivered, if the borrower pays.
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
  const key = `delivery:${delivery.id}`;
  return recordPayment(
    {
      kind: "CAPTURE",
      rentalId: rental.id,
      rentalItemId: delivery.rentalItemId,
      amount: total.toFixed(2),
      key,
      note: `Delivery fee (${delivery.type.toLowerCase()})`,
    },
    () => gateway().capture(rental.preAuthRef ?? "", total.toFixed(2), key),
  );
}

/** Refund part of an item's charge to the borrower (an upheld overcharge dispute). */
export async function refundItem(itemId: string, amount: string, reason: string) {
  const capture = await db.payment.findUnique({ where: { idempotencyKey: `capture:${itemId}` } });
  if (!capture || capture.status !== "SUCCEEDED")
    throw new PaymentError("Nothing was charged for this pair");
  const take = D.min(new D(amount), toD(capture.amount));
  if (take.lte(0)) return null;
  const key = `refund:${itemId}:${reason}`;
  return recordPayment(
    {
      kind: "REFUND",
      rentalId: capture.rentalId,
      rentalItemId: itemId,
      amount: take.toFixed(2),
      key,
      note: reason,
    },
    () => gateway().refund(capture.gatewayRef ?? "", take.toFixed(2), key),
  );
}
