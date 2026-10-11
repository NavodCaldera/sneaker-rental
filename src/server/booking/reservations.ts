import "server-only";
import { toD } from "@/lib/decimal";
import { formatTokens } from "@/lib/format";
import { type Tx, db } from "../db";
import { requestDelivery } from "../logistics/requests";
import { flushEmails, notify } from "../notify";
import { finishRentalIfDone, releaseRent, unlockPairValue } from "../payments";
import { getActiveSettings } from "../settings";
import { pairLocked, rentLockedFor, walletBalance } from "../wallet";
import { customerAddress } from "./addresses";
import { BookingError } from "./errors";
import { replan } from "./plan";
import { shoeName } from "@/lib/shoe-name";

/**
 * Reservations of a pair someone else holds ("reserve next", pricing-spec.md §6a). A held
 * pair can be reserved from its holder's day 1, for a term starting after the holder's term
 * ends (direct handoff). When the holder gives notice of an early return, the reservation
 * would start earlier (and usually cost more, as the pair has less wear), so the borrower
 * gets an offer of the new dates and price (in the app and by email, `offerResponseHours`
 * to answer): accept and it is handed over after the holder's new last day; reject, or let
 * it expire, and the reservation is cancelled and all its tokens unlocked. The pair then
 * stays with its holder, free, once their term ends (`holdForNext`), until a new borrower
 * books it; that booking hands it over straight away.
 */

/**
 * Cancel a reservation that hasn't started: unlock its deposit and rent estimate (refunding
 * anything already charged), tell the borrower why, and plan their other pairs again. With
 * `holdPair` (a declined or expired offer) the holder's pair is kept for the next booking
 * instead of going back to the merchant. Call `finishRentalIfDone(rentalId)` after the
 * transaction.
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
  const name = shoeName(item.shoe);
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
  if (options.holdPair) await holdForNextBooking(tx, item.shoeId, name);

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

/**
 * Keep a pair with its holder for the next booking (pricing-spec.md §6a): when their holding
 * ends it isn't collected; it waits with them, free, until a new borrower books it. A holder
 * who has already ended and is waiting is told now; one still in their term is told when it
 * ends.
 */
async function holdForNextBooking(tx: Tx, shoeId: string, name: string) {
  const holders = await tx.rentalItem.findMany({
    where: { shoeId, status: { in: ["ACTIVE", "RETURNING"] } },
    include: { rental: true },
  });
  for (const h of holders) {
    await tx.rentalItem.update({ where: { id: h.id }, data: { holdForNext: true } });
    if (h.status !== "RETURNING") continue;
    await notify(tx, {
      userId: h.rental.borrowerId,
      kind: "TERM_ENDED",
      rentalItemId: h.id,
      link: "/rentals",
      title: `${name}: please keep it for the next borrower`,
      body:
        `The borrower who reserved your ${name} isn't taking it early, so please keep it safe ` +
        `for now. As soon as someone else books it, a driver takes it straight to them. You ` +
        `aren't charged for these days.`,
    });
  }
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
    fromAddress: await customerAddress(tx, giver.rental.borrowerId),
    toAddress: await customerAddress(tx, next.rental.borrowerId),
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

/** Cancel a reservation whose offer wasn't taken; the pair waits with its holder. */
async function dropOffer(itemId: string, rentalId: string, reason: string, now: Date) {
  await db.$transaction((tx) => cancelReservation(tx, itemId, reason, now, { holdPair: true }));
  await finishRentalIfDone(rentalId);
  await flushEmails(now);
}

/**
 * The borrower turns the new dates and price down (or wants to keep their original dates,
 * which we can't hold): the reservation is cancelled and all its tokens unlocked. The pair
 * stays with its holder until a new borrower books it.
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
