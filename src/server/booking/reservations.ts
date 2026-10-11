import "server-only";
import { toD } from "@/lib/decimal";
import { formatTokens } from "@/lib/format";
import { type Tx, db } from "../db";
import { requestDelivery } from "../logistics/requests";
import { flushEmails, notify } from "../notify";
import { finishRentalIfDone, releaseRent, unlockPairValue } from "../payments";
import { getActiveSettings } from "../settings";
import { pairLocked, rentLockedFor, walletBalance } from "../wallet";
import { BookingError } from "./errors";
import { replan } from "./plan";

/**
 * Reservations of a pair someone else holds ("reserve next", pricing-spec.md §6a). A held
 * pair can be reserved from its holder's day 1, for a term starting after the holder's term
 * ends (direct handoff). When the holder gives notice of an early return, the reservation
 * would start earlier (and usually cost more, as the pair has less wear), so the borrower
 * gets an offer of the new dates and price (in the app and by email, `offerResponseHours`
 * to answer): accept and it is handed over after the holder's new last day; reject, or let
 * it expire, and the reservation is cancelled, all its tokens unlocked, and the pair goes
 * back to the merchant.
 */

/**
 * Cancel a reservation that hasn't started: unlock its deposit and rent estimate (refunding
 * anything already charged), tell the borrower why, and plan their other pairs again. Call
 * `finishRentalIfDone(rentalId)` after the transaction.
 */
export async function cancelReservation(
  tx: Tx,
  itemId: string,
  reason: string,
  now: Date,
  options: { tell?: boolean } = {},
) {
  const item = await tx.rentalItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { rental: true, shoe: true },
  });
  if (item.status !== "WAITING_HANDOFF") return null;
  const name = `${item.shoe.brand} ${item.shoe.model}`;
  await tx.rentalItem.update({
    where: { id: item.id },
    data: {
      status: "CANCELLED",
      offerFirstDay: null,
      offerCharge: null,
      offerWearStart: null,
      offerDueAt: null,
    },
  });
  const released = (await pairLocked(item.id, tx))
    .plus(await rentLockedFor(item.id, tx))
    .plus(toD(item.rentPaid));
  await releaseRent(tx, item.id, `Reservation cancelled: ${name}`);
  await unlockPairValue(tx, item.id, `Reservation cancelled: ${name}`);

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
        `Your reservation of the ${name} was cancelled because ${reason}. The pair has been ` +
        `released, and we've unlocked the ${formatTokens(released)} set aside for it ` +
        `(deposit and rent estimate). Nothing was charged.`,
    });
  }
  return item;
}

/** The holder's pair, if they have ended and it is waiting with them (no driver booked). */
async function waitingHolder(tx: Tx, shoeId: string) {
  return tx.rentalItem.findFirst({
    where: {
      shoeId,
      status: "RETURNING",
      outgoing: { none: { status: { not: "CANCELLED" } } },
      deliveries: { none: { type: "COLLECT", status: { not: "CANCELLED" } } },
    },
    include: { rental: true, shoe: true },
  });
}

/**
 * If a pair's holder has ended their rental and is waiting with it, and someone has
 * reserved it with no offer pending, book the direct handoff now.
 */
export async function handOffIfWaiting(tx: Tx, shoeId: string) {
  const giver = await waitingHolder(tx, shoeId);
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

/**
 * If a pair's holder has ended and is waiting with it and nobody has reserved it any more
 * (an offer was turned down or ran out), send a driver to take it back to the merchant.
 */
export async function collectIfWaiting(tx: Tx, shoeId: string) {
  const holder = await waitingHolder(tx, shoeId);
  if (!holder) return null;
  const queued = await tx.rentalItem.count({ where: { shoeId, status: "WAITING_HANDOFF" } });
  if (queued > 0) return null;
  return requestDelivery(tx, {
    type: "COLLECT",
    rentalItemId: holder.id,
    fromAddress: holder.rental.deliveryAddress,
    toAddress: holder.shoe.pickupAddress,
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
 * The borrower accepts the new dates and price: they become their plan and the rent lock
 * moves to the new estimate. The pair is handed over as soon as its holder's (shortened)
 * term ends, or now if they have already ended. Refused, with nothing changed, if their
 * available tokens can't cover the higher estimate.
 */
export async function acceptOffer(borrowerId: string, itemId: string, now = new Date()) {
  const settings = await getActiveSettings(now);
  await db.$transaction(async (tx) => {
    const item = await findOffer(tx, borrowerId, itemId, now);
    await tx.rentalItem.update({
      where: { id: item.id },
      data: {
        plannedFirstDay: item.offerFirstDay,
        plannedCharge: item.offerCharge,
        plannedWearStart: item.offerWearStart,
        offerFirstDay: null,
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

/** Cancel a reservation whose offer wasn't taken, and send the pair home if it's waiting. */
async function dropOffer(itemId: string, rentalId: string, reason: string, now: Date) {
  await db.$transaction(async (tx) => {
    const item = await cancelReservation(tx, itemId, reason, now);
    if (item) await collectIfWaiting(tx, item.shoeId);
  });
  await finishRentalIfDone(rentalId);
  await flushEmails(now);
}

/**
 * The borrower turns the new dates and price down (or wants to keep their original dates,
 * which we can't hold): the reservation is cancelled, all its tokens unlocked, and the pair
 * goes back to the merchant when its holder's term ends.
 */
export async function rejectOffer(borrowerId: string, itemId: string, now = new Date()) {
  const item = await db.$transaction((tx) => findOffer(tx, borrowerId, itemId, now));
  await dropOffer(
    item.id,
    item.rentalId,
    "the pair is coming back early and you chose not to take it on the new dates and price",
    now,
  );
}

/** Daily job: cancel reservations whose offer wasn't accepted in time. */
export async function expireOffers(now = new Date()) {
  const due = await db.rentalItem.findMany({
    where: { status: "WAITING_HANDOFF", offerDueAt: { lt: now } },
    select: { id: true, rentalId: true },
  });
  for (const item of due) {
    await dropOffer(
      item.id,
      item.rentalId,
      "the pair is coming back early and the new dates and price weren't accepted in time",
      now,
    );
  }
  return due.length;
}
