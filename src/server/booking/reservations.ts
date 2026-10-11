import "server-only";
import { D, toD } from "@/lib/decimal";
import { formatTokens } from "@/lib/format";
import { type Tx, db } from "../db";
import { requestDelivery } from "../logistics/requests";
import { flushEmails, notify } from "../notify";
import { finishRentalIfDone, settleRent, unlockPairValue } from "../payments";
import { getActiveSettings } from "../settings";
import { walletBalance } from "../wallet";
import { BookingError } from "./errors";
import { replan } from "./plan";

/**
 * Reservations of a pair someone else holds ("reserve next", pricing-spec.md §6a, §8).
 * When the holder gives notice of an early return and the pair would cost the next borrower
 * more, they get an offer (in the app and by email, `offerResponseHours` to answer): accept
 * and it is handed over when the holder's term ends; reject, or let it expire, and the
 * reservation is cancelled and refunded. The pair then waits with the holder until someone
 * else books it.
 */

/**
 * Cancel a reservation that hasn't started: refund its rent, unlock its deposit and plan the
 * borrower's other pairs again. Call `finishRentalIfDone(rentalId)` after the transaction.
 */
export async function cancelReservation(
  tx: Tx,
  itemId: string,
  reason: string,
  now: Date,
  options: { tell?: boolean; holdPair?: boolean } = {},
) {
  const item = await tx.rentalItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { rental: true, shoe: true },
  });
  if (item.status !== "WAITING_HANDOFF") return null;
  const name = `${item.shoe.brand} ${item.shoe.model}`;
  await tx.rentalItem.update({
    where: { id: item.id },
    data: { status: "CANCELLED", offerCharge: null, offerWearStart: null, offerDueAt: null },
  });
  const refunded = toD(item.rentPaid);
  await settleRent(tx, {
    userId: item.rental.borrowerId,
    rentalId: item.rentalId,
    itemId: item.id,
    rentPaid: refunded,
    target: new D(0),
    note: { charge: "Rent", refund: `Reservation cancelled: ${name}` },
  });
  await unlockPairValue(tx, item.id, "Reservation cancelled: value unlocked");
  if (options.holdPair) {
    // Turned down over price: the pair waits with its holder for the next booking instead
    // of going back to the merchant.
    await tx.rentalItem.updateMany({
      where: { shoeId: item.shoeId, status: { in: ["ACTIVE", "RETURNING"] } },
      data: { holdForNext: true },
    });
  }

  const left = await tx.rentalItem.findMany({
    where: { rentalId: item.rentalId, id: { not: item.id } },
    select: { status: true },
  });
  if (left.every((i) => ["CLOSED", "CANCELLED", "LOST"].includes(i.status))) {
    const anySettled = left.some((i) => i.status !== "CANCELLED");
    await tx.rental.update({
      where: { id: item.rentalId },
      data: { status: anySettled ? "CLOSED" : "CANCELLED", closedAt: now },
    });
  }
  await replan(tx, { borrowerIds: [item.rental.borrowerId], shoeIds: [item.shoeId] }, now, {
    actorId: item.rental.borrowerId,
  });
  if (options.tell ?? true) {
    await notify(tx, {
      userId: item.rental.borrowerId,
      kind: "RESERVATION_CANCELLED",
      rentalItemId: item.id,
      link: "/rentals",
      title: `${name}: reservation cancelled`,
      body:
        `Your reservation of the ${name} was cancelled because ${reason}. ` +
        `We've refunded your rent of ${formatTokens(refunded)} and unlocked your deposit.`,
    });
  }
  return item;
}

/**
 * If a pair's holder has ended their rental and is waiting with it (no driver booked), and
 * someone has reserved it with no offer pending, book the direct handoff now.
 */
export async function handOffIfWaiting(tx: Tx, shoeId: string) {
  const giver = await tx.rentalItem.findFirst({
    where: {
      shoeId,
      status: "RETURNING",
      outgoing: { none: { status: { not: "CANCELLED" } } },
      deliveries: { none: { type: "COLLECT", status: { not: "CANCELLED" } } },
    },
    include: { rental: true },
  });
  if (!giver) return null;
  const next = await tx.rentalItem.findFirst({
    where: { shoeId, status: "WAITING_HANDOFF", offerCharge: null },
    include: { rental: true },
    orderBy: { createdAt: "asc" },
  });
  if (!next) return null;
  return requestDelivery(tx, {
    type: "HANDOFF",
    rentalItemId: next.id,
    fromRentalItemId: giver.id,
    fromAddress: giver.rental.deliveryAddress,
    toAddress: next.rental.deliveryAddress,
  });
}

async function findOffer(tx: Tx, borrowerId: string, itemId: string, now: Date) {
  const item = await tx.rentalItem.findFirst({ where: { id: itemId, rental: { borrowerId } } });
  if (!item) throw new BookingError("Rental not found");
  if (item.status !== "WAITING_HANDOFF" || item.offerCharge === null) {
    throw new BookingError("There's no new price waiting for you on this pair");
  }
  if (item.offerDueAt && item.offerDueAt < now) throw new BookingError("This offer has expired");
  return item;
}

/**
 * The borrower accepts the higher price: it becomes their plan and the difference is
 * charged. The pair is handed over as soon as its holder's (shortened) term ends, or now if
 * they have already ended. Refused if their available tokens can't cover it.
 */
export async function acceptOffer(borrowerId: string, itemId: string, now = new Date()) {
  const settings = await getActiveSettings(now);
  await db.$transaction(async (tx) => {
    const item = await findOffer(tx, borrowerId, itemId, now);
    await tx.rentalItem.update({
      where: { id: item.id },
      data: {
        plannedCharge: item.offerCharge,
        plannedWearStart: item.offerWearStart,
        offerCharge: null,
        offerWearStart: null,
        offerDueAt: null,
      },
    });
    await replan(tx, { borrowerIds: [borrowerId], shoeIds: [item.shoeId] }, now, {
      actorId: borrowerId,
      settings,
    });
    const { available } = await walletBalance(borrowerId, tx);
    if (available.lt(0)) {
      throw new BookingError(`Top up ${available.neg().toFixed(2)} tokens to accept the new price`);
    }
    await handOffIfWaiting(tx, item.shoeId);
  });
  await flushEmails(now);
}

/** The borrower turns the higher price down: the reservation is cancelled and refunded. */
export async function rejectOffer(borrowerId: string, itemId: string, now = new Date()) {
  const item = await db.$transaction(async (tx) => {
    const item = await findOffer(tx, borrowerId, itemId, now);
    await cancelReservation(tx, item.id, "you turned down the new price", now, {
      tell: false,
      holdPair: true,
    });
    return item;
  });
  await finishRentalIfDone(item.rentalId);
}

/** Daily job: cancel reservations whose offer wasn't accepted in time. */
export async function expireOffers(now = new Date()) {
  const due = await db.rentalItem.findMany({
    where: { status: "WAITING_HANDOFF", offerDueAt: { lt: now } },
    select: { id: true, rentalId: true },
  });
  for (const item of due) {
    await db.$transaction((tx) =>
      cancelReservation(tx, item.id, "the new price wasn't accepted in time", now, {
        holdPair: true,
      }),
    );
    await finishRentalIfDone(item.rentalId);
  }
  return due.length;
}
