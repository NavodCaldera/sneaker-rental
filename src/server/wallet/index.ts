import "server-only";
import { randomUUID } from "node:crypto";
import type { WalletEntryKind } from "@/generated/prisma/client";
import { D, toD } from "@/lib/decimal";
import { type Tx, db } from "../db";
import { gateway } from "../payments/gateway";

/**
 * Borrower tokens (1 token = 1 LKR), kept as an append-only ledger (pricing-spec.md §6).
 * Borrowers top up through the payment gateway. Booking locks each pair's merchant value as
 * its own deposit and charges the rent for the booked term; changes to the plan are charged
 * or credited as they happen (pricing-spec.md §6a). A pair's deposit stays locked at its full
 * value while the pair is out: rent comes from the free balance (trip fees never go through
 * us: the receiver pays the driver), and only damage to or loss of that pair is charged
 * against it. Only available (unlocked) tokens can be withdrawn to the card that paid for
 * them.
 *
 * Amounts here are already-rounded 2-dp values (charges come from the pricing engine via
 * booking). Every write carries an idempotency key, so a repeated call is a no-op.
 */

export class WalletError extends Error {}

export type Balance = { balance: D; locked: D; available: D };

const MONEY = /^\d+(\.\d{1,2})?$/;
/** Largest single top-up or withdrawal, in tokens. */
export const MAX_TRANSFER = 1_000_000;

/** Serialise wallet writes for one user: a row lock on the user until the transaction ends. */
async function lockWallet(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

function totals(
  rows: { kind: WalletEntryKind; _sum: { amount: { toString(): string } | null } }[],
) {
  const sum = (kind: WalletEntryKind) => toD(rows.find((r) => r.kind === kind)?._sum.amount ?? 0);
  return sum;
}

/** Balance = top-ups + credits − charges − withdrawals; available = balance − locked. */
export async function walletBalance(userId: string, tx: Tx = db): Promise<Balance> {
  const rows = await tx.walletEntry.groupBy({
    by: ["kind"],
    where: { userId },
    _sum: { amount: true },
  });
  const sum = totals(rows);
  const balance = sum("TOP_UP").plus(sum("CREDIT")).minus(sum("CHARGE")).minus(sum("WITHDRAWAL"));
  const locked = sum("LOCK").minus(sum("UNLOCK"));
  return { balance, locked, available: balance.minus(locked) };
}

/** Tokens still locked for one rental (the deposits of its pairs not yet settled). */
export async function rentalLocked(rentalId: string, tx: Tx = db): Promise<D> {
  const rows = await tx.walletEntry.groupBy({
    by: ["kind"],
    where: { rentalId, kind: { in: ["LOCK", "UNLOCK"] } },
    _sum: { amount: true },
  });
  const sum = totals(rows);
  return sum("LOCK").minus(sum("UNLOCK"));
}

/** Tokens still locked as one pair's deposit. */
export async function pairLocked(rentalItemId: string, tx: Tx = db): Promise<D> {
  const rows = await tx.walletEntry.groupBy({
    by: ["kind"],
    where: { rentalItemId, kind: { in: ["LOCK", "UNLOCK"] } },
    _sum: { amount: true },
  });
  const sum = totals(rows);
  return sum("LOCK").minus(sum("UNLOCK"));
}

type EntryInput = {
  userId: string;
  kind: WalletEntryKind;
  amount: D;
  key: string;
  rentalId?: string;
  rentalItemId?: string;
  paymentId?: string;
  note?: string;
};

/** Write one ledger entry unless its key exists; zero amounts are skipped. */
async function entry(tx: Tx, input: EntryInput) {
  if (input.amount.lte(0)) return null;
  const existing = await tx.walletEntry.findUnique({ where: { idempotencyKey: input.key } });
  if (existing) return existing;
  const { key, amount, ...rest } = input;
  return tx.walletEntry.create({
    data: { ...rest, amount: amount.toFixed(2), idempotencyKey: key },
  });
}

async function done(tx: Tx, key: string) {
  return !!(await tx.walletEntry.findUnique({ where: { idempotencyKey: key } }));
}

/**
 * Lock one pair's deposit (its merchant value V) inside the booking transaction. It stays
 * locked, at V, until the pair is back and settled (pricing-spec.md §6): other charges never
 * eat into it. Throws with the amount to top up if the borrower's available tokens are short.
 */
export async function lockDeposit(
  tx: Tx,
  input: { userId: string; rentalId: string; rentalItemId: string; amount: D },
) {
  await lockWallet(tx, input.userId);
  const { available } = await walletBalance(input.userId, tx);
  if (available.lt(input.amount)) {
    throw new WalletError(
      `You need ${input.amount.toFixed(2)} tokens available; top up ${input.amount.minus(D.max(available, 0)).toFixed(2)}`,
    );
  }
  await entry(tx, {
    userId: input.userId,
    kind: "LOCK",
    amount: input.amount,
    key: `lock:${input.rentalItemId}`,
    rentalId: input.rentalId,
    rentalItemId: input.rentalItemId,
    note: "Deposit: pair value",
  });
}

/**
 * Charge from the free balance, leaving locked tokens alone (rent for a booked term, or a
 * change to it). The balance may go negative; callers that must not allow that check
 * `walletBalance` afterwards and roll back.
 */
export async function chargeFree(
  tx: Tx,
  input: {
    userId: string;
    amount: D;
    key: string;
    note: string;
    rentalId?: string;
    rentalItemId?: string;
  },
) {
  await lockWallet(tx, input.userId);
  return entry(tx, { ...input, kind: "CHARGE" });
}

/**
 * Charge against one pair's deposit (damage, or a lost pair): from that pair's locked tokens
 * first, then the free balance. Other pairs' deposits are never touched. The balance may go
 * negative, a debt the borrower must top up before booking again. Returns false if this
 * charge was already taken.
 */
export async function chargeFromDeposit(
  tx: Tx,
  input: {
    userId: string;
    rentalId: string;
    rentalItemId: string;
    amount: D;
    key: string;
    note: string;
  },
): Promise<boolean> {
  await lockWallet(tx, input.userId);
  if (await done(tx, input.key)) return false;
  const fromLocked = D.min(input.amount, D.max(0, await pairLocked(input.rentalItemId, tx)));
  const base = { userId: input.userId, rentalId: input.rentalId, rentalItemId: input.rentalItemId };
  await entry(tx, {
    ...base,
    kind: "UNLOCK",
    amount: fromLocked,
    key: `${input.key}:unlock`,
    note: input.note,
  });
  await entry(tx, {
    ...base,
    kind: "CHARGE",
    amount: input.amount,
    key: input.key,
    note: input.note,
  });
  return true;
}

/** Release what is left of one pair's deposit. */
export async function unlockDeposit(
  tx: Tx,
  input: { userId: string; rentalId: string; rentalItemId: string; key: string; note: string },
) {
  await lockWallet(tx, input.userId);
  return entry(tx, {
    ...input,
    kind: "UNLOCK",
    amount: await pairLocked(input.rentalItemId, tx),
  });
}

/** Release everything still locked for a rental, once all its pairs are settled. */
export async function unlockRental(
  tx: Tx,
  input: { userId: string; rentalId: string; key: string; note: string },
) {
  await lockWallet(tx, input.userId);
  return entry(tx, {
    ...input,
    kind: "UNLOCK",
    amount: await rentalLocked(input.rentalId, tx),
  });
}

/** Give tokens back (e.g. an upheld overcharge). */
export async function credit(
  tx: Tx,
  input: {
    userId: string;
    amount: D;
    key: string;
    note: string;
    rentalId?: string;
    rentalItemId?: string;
  },
) {
  return entry(tx, { ...input, kind: "CREDIT" });
}

function parseAmount(amount: string): D {
  const v = amount.trim();
  if (!MONEY.test(v) || new D(v).lte(0)) throw new WalletError("Enter an amount, up to 2 decimals");
  if (new D(v).gt(MAX_TRANSFER)) throw new WalletError(`At most ${MAX_TRANSFER} tokens at a time`);
  return new D(v);
}

/**
 * Buy tokens: a card sale through the gateway, then a TOP_UP entry. `key` should come from
 * the form (one per page view) so a double submit charges once.
 */
export async function topUp(userId: string, amount: string, key: string = randomUUID()) {
  const value = parseAmount(amount);
  const paymentKey = `topup:${userId}:${key}`;
  const existing = await db.payment.findUnique({ where: { idempotencyKey: paymentKey } });
  if (existing?.status === "SUCCEEDED") return existing;
  const result = await gateway().charge(value.toFixed(2), paymentKey);
  const data = {
    userId,
    kind: "TOP_UP" as const,
    amount: value.toFixed(2),
    gateway: gateway().name,
    gatewayRef: result.ok ? result.ref : null,
    status: result.ok ? ("SUCCEEDED" as const) : ("FAILED" as const),
    note: result.ok ? "Token top-up" : result.error,
  };
  const payment = existing
    ? await db.payment.update({ where: { id: existing.id }, data })
    : await db.payment.create({ data: { ...data, idempotencyKey: paymentKey } });
  if (!result.ok) throw new WalletError(`Payment failed: ${result.error}`);
  await db.$transaction(async (tx) => {
    await lockWallet(tx, userId);
    await entry(tx, {
      userId,
      kind: "TOP_UP",
      amount: value,
      key: paymentKey,
      paymentId: payment.id,
      note: "Token top-up",
    });
  });
  return payment;
}

/**
 * Get unused tokens back: refunds of the borrower's top-ups, newest first, each up to what
 * is left of it. The tokens are taken off first (so they can't be spent twice) and given
 * back if a refund fails.
 */
export async function withdraw(userId: string, amount: string) {
  const value = parseAmount(amount);
  const id = randomUUID();
  await db.$transaction(async (tx) => {
    await lockWallet(tx, userId);
    const { available } = await walletBalance(userId, tx);
    if (available.lt(value)) {
      throw new WalletError(`You can withdraw up to ${D.max(available, 0).toFixed(2)} tokens`);
    }
    await entry(tx, {
      userId,
      kind: "WITHDRAWAL",
      amount: value,
      key: `withdraw:${id}`,
      note: "Refund to card",
    });
  });

  const topUps = await db.payment.findMany({
    where: { userId, kind: "TOP_UP", status: "SUCCEEDED" },
    include: { refunds: { where: { status: "SUCCEEDED" } } },
    orderBy: { createdAt: "desc" },
  });
  let left = value;
  for (const t of topUps) {
    if (left.lte(0)) break;
    const refunded = t.refunds.reduce((sum, r) => sum.plus(toD(r.amount)), new D(0));
    const part = D.min(left, toD(t.amount).minus(refunded));
    if (part.lte(0)) continue;
    const key = `withdraw:${id}:${t.id}`;
    const result = await gateway().refund(t.gatewayRef ?? "", part.toFixed(2), key);
    await db.payment.create({
      data: {
        userId,
        kind: "WITHDRAWAL",
        amount: part.toFixed(2),
        gateway: gateway().name,
        gatewayRef: result.ok ? result.ref : null,
        status: result.ok ? "SUCCEEDED" : "FAILED",
        idempotencyKey: key,
        refundOfId: t.id,
        note: result.ok ? "Token withdrawal" : result.error,
      },
    });
    if (result.ok) left = left.minus(part);
  }
  if (left.gt(0)) {
    // Couldn't refund all of it (a refund failed, or tokens came from credits, not cards).
    await db.$transaction((tx) =>
      credit(tx, {
        userId,
        amount: left,
        key: `withdraw:${id}:return`,
        note: "Withdrawal not completed",
      }),
    );
    throw new WalletError(
      `${value.minus(left).toFixed(2)} tokens refunded; ${left.toFixed(2)} could not be refunded and are back in your balance`,
    );
  }
}

/** A borrower's ledger, newest first, for the wallet page. */
export async function walletHistory(userId: string, take = 50) {
  return db.walletEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    include: { rentalItem: { include: { shoe: { select: { brand: true, model: true } } } } },
  });
}
