import "server-only";
import type { Delivery, Grade } from "@/generated/prisma/client";
import { z } from "zod";
import { toD } from "@/lib/decimal";
import { formatDate } from "@/lib/format";
import { catchUpPhi, chargedAmounts, incomeBetween } from "@/lib/pricing";
import {
  atEndOfLife,
  colomboDay,
  dateToDay,
  dayNumber,
  dayToDate,
  firstDayAfterDelivery,
  plannedLastDay,
  receiverFirstDay,
  wearAdded,
  wearEnd,
} from "@/lib/wear-ledger";
import { merchantFundedDiscounts, merchantOwed, shoeCurve } from "../catalogue/pricing";
import { type Tx, db } from "../db";
import { requestDelivery } from "../logistics/requests";
import { flushEmails, notify } from "../notify";
import { collectRent, finishRentalIfDone, settleItems } from "../payments";
import { type SettingsRow, getActiveSettings } from "../settings";
import { checkPhoto, savePhoto } from "../storage";
import { walletBalance } from "../wallet";
import { BookingError } from "./errors";
import { loadHoldings } from "./holdings";
import { replan } from "./plan";
import { cancelReservation } from "./reservations";

// ─── Borrower ends a pair (§5.3) ───────────────────────────────────────────

/**
 * A held pair's term ends: the daily job calls this on the day after the term's last day
 * (`termEnded`). A borrower can also end it themselves on the term's last day, or at once
 * within `freeReturnHours` of delivery (wrong size); ending any earlier needs notice
 * (`scheduleEarlyReturn`). The last day is today, or the term's last day if that came
 * first; waiting for the driver is free. The plan is redone, so the rent lock drops to the
 * days held (pricing-spec.md §6a). If another borrower has reserved the pair it goes to them
 * by direct handoff, unless ending early gave them an offer of new dates they haven't
 * answered yet: then it waits here. With no reservation it goes back to the merchant, unless
 * a reservation on it was declined after an early return (`holdForNext`): then it waits
 * here, free, until a new borrower books it.
 */
export async function endRental(
  borrowerId: string,
  itemId: string,
  now = new Date(),
  options: { termEnded?: boolean } = {},
) {
  const settings = await getActiveSettings(now);
  const result = await db.$transaction(async (tx) => {
    const item = await tx.rentalItem.findFirst({
      where: { id: itemId, rental: { borrowerId } },
      include: { rental: true, shoe: true },
    });
    if (!item) throw new BookingError("Rental not found");
    if (item.status !== "ACTIVE") throw new BookingError("Only pairs you hold can be ended");

    const today = colomboDay(now);
    const termEnd = item.termEndDay ? dateToDay(item.termEndDay) : null;
    const lastDay = termEnd === null ? today : Math.min(today, termEnd);
    const freeReturn =
      !!item.startDate &&
      now.getTime() - item.startDate.getTime() <= settings.freeReturnHours * 3_600_000;
    if (!options.termEnded && !freeReturn && termEnd !== null && today < termEnd) {
      const earliest = today + settings.earlyReturnNoticeDays;
      throw new BookingError(
        earliest < termEnd
          ? `To end early, give ${settings.earlyReturnNoticeDays} days' notice: pick a last ` +
              `day from ${formatDate(dayToDate(earliest))}`
          : `Your term ends on ${formatDate(dayToDate(termEnd))}; a driver collects the pair ` +
              `the day after`,
      );
    }
    await tx.rentalItem.update({
      where: { id: item.id },
      data: {
        status: "RETURNING",
        returnRequestedAt: now,
        lastDay: dayToDate(lastDay),
        freeReturn,
      },
    });
    // The release discount for the next borrower now counts from the real last day.
    await tx.shoe.update({ where: { id: item.shoeId }, data: { releaseDay: dayToDate(lastDay) } });

    const { offers } = await replan(
      tx,
      { borrowerIds: [borrowerId], shoeIds: [item.shoeId] },
      now,
      { actorId: borrowerId, settings },
    );
    if (options.termEnded) {
      await notify(tx, {
        userId: borrowerId,
        kind: "TERM_ENDED",
        rentalItemId: item.id,
        link: "/rentals",
        title: `${item.shoe.brand} ${item.shoe.model}: your rental has ended`,
        body: item.holdForNext
          ? `Your term ended on ${formatDate(dayToDate(lastDay))}. Please keep the pair safe ` +
            `for now: as soon as the next borrower books it, a driver takes it straight to ` +
            `them. You aren't charged for these days.`
          : `Your term ended on ${formatDate(dayToDate(lastDay))}. A driver will collect the ` +
            `pair; you aren't charged for the days until they come.`,
      });
    }

    // Don't hand off a pair that reaches end of life with this holding.
    const planned = await tx.rentalItem.findUniqueOrThrow({ where: { id: item.id } });
    const endOfLife = atEndOfLife(
      (planned.plannedWearEnd ?? item.shoe.wear).toString(),
      item.shoe.lifespanDays,
    );
    let next = await tx.rentalItem.findFirst({
      where: { shoeId: item.shoeId, status: "WAITING_HANDOFF" },
      include: { rental: true },
      orderBy: { createdAt: "asc" },
    });
    const cancelled: string[] = [];
    if (next && endOfLife) {
      await cancelReservation(tx, next.id, "the pair has reached the end of its life", now);
      cancelled.push(next.rentalId);
      next = null;
    }

    if (next && offers.includes(next.id)) {
      // Wait with the borrower until the next borrower decides on the new price.
      return { delivery: null, cancelled };
    }
    if (next) {
      const delivery = await requestDelivery(tx, {
        type: "HANDOFF",
        rentalItemId: next.id,
        fromRentalItemId: item.id,
        fromAddress: item.rental.deliveryAddress,
        toAddress: next.rental.deliveryAddress,
      });
      return { delivery, cancelled };
    }
    if (item.holdForNext && !endOfLife) {
      // A reservation was declined after an early return: keep it here for the next booking.
      return { delivery: null, cancelled };
    }
    const delivery = await requestDelivery(tx, {
      type: "COLLECT",
      rentalItemId: item.id,
      fromAddress: item.rental.deliveryAddress,
      toAddress: item.shoe.pickupAddress,
    });
    return { delivery, cancelled };
  });
  for (const rentalId of result.cancelled) await finishRentalIfDone(rentalId);
  await flushEmails(now);
  return result.delivery;
}

export const earlyReturnSchema = z.object({
  lastDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick your last day"),
});

/**
 * The borrower gives notice of an early return (pricing-spec.md §6a): they pick a new last
 * day at least `earlyReturnNoticeDays` away and before the term's last day. The term is
 * shortened to it, so the rent lock for the unused days is released now, the pair's
 * committed wear drops, its release day moves forward, and a reserved-next borrower gets an
 * offer to take it earlier at the new price. The borrower keeps the pair until then; the
 * daily job ends the term the day after.
 */
export async function scheduleEarlyReturn(
  borrowerId: string,
  itemId: string,
  lastDayIso: string,
  now = new Date(),
) {
  const settings = await getActiveSettings(now);
  const lastDay = dayNumber(lastDayIso);
  await db.$transaction(async (tx) => {
    const item = await tx.rentalItem.findFirst({ where: { id: itemId, rental: { borrowerId } } });
    if (!item) throw new BookingError("Rental not found");
    if (item.status !== "ACTIVE" || item.lastDay || !item.firstDay || !item.termEndDay) {
      throw new BookingError("Only pairs you hold can be returned early");
    }
    const termEnd = dateToDay(item.termEndDay);
    const firstDay = dateToDay(item.firstDay);
    const earliest = Math.max(colomboDay(now) + settings.earlyReturnNoticeDays, firstDay);
    if (earliest >= termEnd) {
      throw new BookingError(
        `Your term ends on ${formatDate(item.termEndDay)}, less than ` +
          `${settings.earlyReturnNoticeDays} days away, so it can't be shortened`,
      );
    }
    if (lastDay < earliest || lastDay >= termEnd) {
      throw new BookingError(
        `Pick a last day from ${formatDate(dayToDate(earliest))} to ` +
          `${formatDate(dayToDate(termEnd - 1))} (${settings.earlyReturnNoticeDays} days' notice)`,
      );
    }
    await tx.rentalItem.update({
      where: { id: item.id },
      data: {
        plannedDays: lastDay - firstDay + 1,
        termEndDay: dayToDate(lastDay),
        earlyReturnAt: now,
      },
    });
    await tx.shoe.update({ where: { id: item.shoeId }, data: { releaseDay: dayToDate(lastDay) } });
    await replan(tx, { borrowerIds: [borrowerId], shoeIds: [item.shoeId] }, now, {
      actorId: borrowerId,
      settings,
    });
  });
  await flushEmails(now);
}

export const extendSchema = z.object({
  days: z.coerce.number().int().min(1, "At least 1 day").max(365),
});

/**
 * Add days to a pair's term before it ends; the extra rent estimate is locked now
 * (pricing-spec.md §6a). Not possible once someone has reserved the pair next. Refused, with
 * nothing changed, if the borrower's available tokens can't cover it.
 */
export async function extendRental(
  borrowerId: string,
  itemId: string,
  days: number,
  now = new Date(),
) {
  const settings = await getActiveSettings(now);
  await db.$transaction(async (tx) => {
    const item = await tx.rentalItem.findFirst({
      where: { id: itemId, rental: { borrowerId } },
      include: { shoe: true },
    });
    if (!item) throw new BookingError("Rental not found");
    if (!["ACTIVE", "AWAITING_DELIVERY"].includes(item.status) || item.lastDay) {
      throw new BookingError("Only pairs you hold or are waiting for can be extended");
    }
    const termEnd = item.termEndDay ? dateToDay(item.termEndDay) : null;
    if (termEnd !== null && colomboDay(now) > termEnd) {
      throw new BookingError("This term has already ended");
    }
    const queued = await tx.rentalItem.count({
      where: { shoeId: item.shoeId, status: "WAITING_HANDOFF" },
    });
    if (queued > 0) {
      throw new BookingError("Someone has reserved this pair after you, so it can't be extended");
    }
    const plannedDays = (item.plannedDays ?? 0) + days;
    const newEnd = termEnd === null ? null : termEnd + days;
    await tx.rentalItem.update({
      where: { id: item.id },
      data: { plannedDays, ...(newEnd !== null && { termEndDay: dayToDate(newEnd) }) },
    });
    if (newEnd !== null) {
      await tx.shoe.update({ where: { id: item.shoeId }, data: { releaseDay: dayToDate(newEnd) } });
    }
    await replan(tx, { borrowerIds: [borrowerId], shoeIds: [item.shoeId] }, now, {
      actorId: borrowerId,
      settings,
    });
    const { available } = await walletBalance(borrowerId, tx);
    if (available.lt(0)) {
      throw new BookingError(
        `Top up ${available.neg().toFixed(2)} tokens to extend by ${days} days`,
      );
    }
  });
  await flushEmails(now);
}

// ─── Delivery events (called by logistics) ─────────────────────────────────

export async function onDeliveryPickedUp(tx: Tx, delivery: Delivery) {
  const item = await tx.rentalItem.findUniqueOrThrow({ where: { id: delivery.rentalItemId } });
  if (delivery.type === "DELIVER") {
    await tx.shoe.update({ where: { id: item.shoeId }, data: { status: "OUT_FOR_DELIVERY" } });
  } else if (delivery.type === "HANDOFF") {
    await tx.shoe.update({ where: { id: item.shoeId }, data: { status: "IN_HANDOFF" } });
  }
}

/**
 * Delivery arrived. The receiving borrower's term starts the day after delivery (or after
 * the giver's last day, if later) and its last day is fixed. The returning or handing-over
 * borrower's last day was set when they ended the rental; the delivery time is recorded as
 * `endDate` (pricing-spec.md §5). Real dates can shift the plan, so it is redone.
 */
export async function onDeliveryDelivered(tx: Tx, delivery: Delivery, at: Date) {
  const item = await tx.rentalItem.findUniqueOrThrow({ where: { id: delivery.rentalItemId } });
  const today = dayToDate(colomboDay(at));
  switch (delivery.type) {
    case "DELIVER": {
      const firstDay = firstDayAfterDelivery(at);
      await startTerm(tx, item, at, firstDay);
      break;
    }
    case "HANDOFF": {
      let giverLastDay: number | null = null;
      if (delivery.fromRentalItemId) {
        const giver = await tx.rentalItem.findUniqueOrThrow({
          where: { id: delivery.fromRentalItemId },
        });
        giverLastDay = giver.lastDay ? dateToDay(giver.lastDay) : colomboDay(at);
        await tx.rentalItem.update({
          where: { id: giver.id },
          data: { endDate: at, lastDay: dayToDate(giverLastDay) },
        });
      }
      await startTerm(tx, item, at, receiverFirstDay(at, giverLastDay));
      break;
    }
    case "COLLECT":
      await tx.rentalItem.update({
        where: { id: item.id },
        data: { endDate: at, lastDay: item.lastDay ?? today },
      });
      await tx.shoe.update({ where: { id: item.shoeId }, data: { status: "CLEANING" } });
      break;
  }
}

/**
 * The pair reached its new holder: day 1 and the term's last day are fixed. The last day is
 * also the pair's release day, from which the next borrower's release discount counts
 * (pricing-spec.md §8). Unknown term: no discount window.
 */
async function startTerm(
  tx: Tx,
  item: { id: string; shoeId: string; plannedDays: number | null; rentalId: string },
  at: Date,
  firstDay: number,
) {
  const termEnd = item.plannedDays ? plannedLastDay(firstDay, item.plannedDays) : null;
  const releaseDay = termEnd === null ? null : dayToDate(termEnd);
  const updated = await tx.rentalItem.update({
    where: { id: item.id },
    data: {
      status: "ACTIVE",
      startDate: at,
      firstDay: dayToDate(firstDay),
      termEndDay: releaseDay,
    },
    include: { rental: true },
  });
  await tx.shoe.update({
    where: { id: item.shoeId },
    data: { status: "WITH_BORROWER", releaseDay },
  });
  await replan(tx, { borrowerIds: [updated.rental.borrowerId], shoeIds: [item.shoeId] }, at, {
    actorId: updated.rental.borrowerId,
  });
}

// ─── Condition reports (§5.2 step 4, §5.3 step 3) ──────────────────────────

export type ConditionInput = {
  itemId: string;
  grade: Grade;
  notes?: string;
  damageFlag?: boolean;
  photos: File[];
};

/** Items closed by a condition report, for payments to capture. */
export type ConditionResult = { reportId: string; closedItemIds: string[] };

/**
 * Records condition at a handover.
 * - A borrower confirming receipt (RECEIPT). If the pair came by handoff, this also closes
 *   the previous borrower's item.
 * - A merchant recording a returned pair (RETURN), which closes the item.
 * A damage flag opens a dispute, which holds that item's payout until an admin decides.
 */
export async function recordCondition(
  userId: string,
  input: ConditionInput,
  now = new Date(),
): Promise<ConditionResult> {
  if (input.photos.length === 0) throw new BookingError("Add at least one photo");
  input.photos.forEach((p, i) => checkPhoto(p, `Photo ${i + 1}`));
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { merchant: true },
  });
  const settings = await getActiveSettings(now);
  const saved: { storageKey: string; contentType: string }[] = [];
  for (const p of input.photos) saved.push(await savePhoto(p, `condition/${input.itemId}`));
  const photoRows = () => saved.map((s) => ({ kind: "CONDITION" as const, ...s }));

  const result = await db.$transaction(async (tx) => {
    const item = await tx.rentalItem.findUniqueOrThrow({
      where: { id: input.itemId },
      include: { rental: true, shoe: true, conditionReports: true },
    });
    const closed: string[] = [];
    let reportId: string;

    if (user.role === "BORROWER") {
      if (item.rental.borrowerId !== userId) throw new BookingError("Rental not found");
      if (item.status !== "ACTIVE")
        throw new BookingError("You can record condition once the pair arrives");
      if (item.conditionReports.some((r) => r.stage === "RECEIPT")) {
        throw new BookingError("Condition already recorded for this pair");
      }
      const report = await tx.conditionReport.create({
        data: {
          shoeId: item.shoeId,
          rentalItemId: item.id,
          recordedById: userId,
          stage: "RECEIPT",
          grade: input.grade,
          notes: input.notes || null,
          damageFlag: !!input.damageFlag,
          photos: { create: photoRows() },
        },
      });
      reportId = report.id;

      // Handoff: the receiver's report is the previous holder's return report.
      const handoff = await tx.delivery.findFirst({
        where: { type: "HANDOFF", rentalItemId: item.id, status: "DELIVERED" },
      });
      if (handoff?.fromRentalItemId) {
        const prev = await tx.rentalItem.findUniqueOrThrow({
          where: { id: handoff.fromRentalItemId },
        });
        if (prev.status === "RETURNING") {
          await tx.conditionReport.create({
            data: {
              shoeId: item.shoeId,
              rentalItemId: prev.id,
              recordedById: userId,
              stage: "RETURN",
              grade: input.grade,
              notes: input.notes || null,
              damageFlag: !!input.damageFlag,
              photos: { create: photoRows() },
            },
          });
          await closeItem(tx, prev.id, now, settings);
          closed.push(prev.id);
          if (input.damageFlag) await openDamageDispute(tx, prev.id, userId, input.notes);
        }
      }
    } else if (user.role === "MERCHANT") {
      if (item.shoe.merchantId !== user.merchant?.id) throw new BookingError("Rental not found");
      if (item.status !== "RETURNING" || !item.endDate) {
        throw new BookingError("This pair hasn't been returned to you yet");
      }
      const report = await tx.conditionReport.create({
        data: {
          shoeId: item.shoeId,
          rentalItemId: item.id,
          recordedById: userId,
          stage: "RETURN",
          grade: input.grade,
          notes: input.notes || null,
          damageFlag: !!input.damageFlag,
          photos: { create: photoRows() },
        },
      });
      reportId = report.id;
      await closeItem(tx, item.id, now, settings);
      closed.push(item.id);
      if (input.damageFlag) await openDamageDispute(tx, item.id, userId, input.notes);
    } else {
      throw new BookingError("Only borrowers and merchants record condition");
    }

    await tx.shoe.update({ where: { id: item.shoeId }, data: { latestGrade: input.grade } });
    return { reportId, closedItemIds: closed };
  });

  // Release the closed pairs' deposits that are no longer needed.
  await settleItems(result.closedItemIds);
  await flushEmails(now);
  return result;
}

async function openDamageDispute(tx: Tx, itemId: string, userId: string, notes?: string) {
  await tx.dispute.create({
    data: {
      rentalItemId: itemId,
      openedById: userId,
      reason: `Damage flagged at handover${notes ? `: ${notes}` : ""}`,
    },
  });
}

// ─── Close-out (§5.4) ──────────────────────────────────────────────────────

/**
 * Closes a rental item: wear from the ledger, charge and split from the pricing engine with
 * the shoe's own settings version, stored on the item and rolled into the shoe. The rent is
 * collected in the same transaction (its lock released, the final rent charged), so the
 * merchant's share only becomes payable once the borrower has paid. Idempotent: a closed
 * item is left alone. `settingsRow` (the active version) sets the dispute window.
 */
export async function closeItem(tx: Tx, itemId: string, now: Date, settingsRow: SettingsRow) {
  const item = await tx.rentalItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { rental: true, shoe: { include: { settings: true } } },
  });
  if (item.status === "CLOSED") return item;
  if (!item.firstDay || !item.lastDay) throw new BookingError("Holding period is incomplete");

  const holdings = await loadHoldings(tx, item.rental.borrowerId);
  const added = wearAdded(holdings, item.id, dateToDay(item.lastDay));
  const wStart = toD(item.shoe.wear);
  // φ is fixed at the start of the item, from the shoe's state before this rental.
  const { params, settings, collected } = shoeCurve(item.shoe);
  const wEnd = wearEnd(wStart, added, item.shoe.lifespanDays, !params.pastLife);
  const phi = settings.catchUp ? catchUpPhi(params, collected, wStart) : toD(item.phi);
  const { income, undiscounted, discountCost } = incomeBetween(
    params,
    wStart,
    wEnd,
    toD(item.discount),
    phi,
  );
  // Merchant first: the merchant's share fills up to their target, the platform gets the
  // rest. A merchant-funded discount lowers the merchant's target by its cost.
  const ownDiscount = item.discountFunding === "MERCHANT" ? discountCost : toD(0);
  const { outstanding } = merchantOwed(
    item.shoe,
    (await merchantFundedDiscounts(tx, item.shoeId)).plus(ownDiscount),
  );
  const { charge, merchantShare, platformShare } = chargedAmounts(income, {
    merchantOutstanding: outstanding,
    undiscounted,
  });

  const closed = await tx.rentalItem.update({
    where: { id: item.id },
    data: {
      status: "CLOSED",
      closedAt: now,
      payableAt: new Date(now.getTime() + settingsRow.disputeWindowDays * 86_400_000),
      wearStart: wStart.toString(),
      wearEnd: wEnd.toString(),
      phi: phi.toString(),
      chargeExact: income.toString(),
      discountCost: discountCost.toString(),
      charge: charge.toFixed(2),
      merchantShare: merchantShare.toFixed(2),
      platformShare: platformShare.toFixed(2),
    },
  });
  await tx.shoe.update({
    where: { id: item.shoeId },
    data: {
      wear: wEnd.toString(),
      collectedSoFar: toD(item.shoe.collectedSoFar).plus(income).toString(),
      lostToDiscounts: toD(item.shoe.lostToDiscounts).plus(discountCost).toString(),
      merchantCollected: toD(item.shoe.merchantCollected).plus(merchantShare).toFixed(2),
    },
  });
  // Post-paid rent: release the estimate and charge the actual rent now.
  await collectRent(tx, item.id);

  const open = await tx.rentalItem.count({
    where: { rentalId: item.rentalId, status: { notIn: ["CLOSED", "CANCELLED", "LOST"] } },
  });
  if (open === 0) {
    await tx.rental.update({
      where: { id: item.rentalId },
      data: { status: "CLOSED", closedAt: now },
    });
  }
  // The pair's settled wear moved: its committed wear and any queue follow.
  await replan(tx, { shoeIds: [item.shoeId] }, now, { settings: settingsRow });
  return tx.rentalItem.findUniqueOrThrow({ where: { id: closed.id } });
}

// ─── Merchant: back in stock ───────────────────────────────────────────────

/** After cleaning: back to Available, or Retired at end of life or grade D (§6). */
export async function markCleaned(merchantId: string, shoeId: string) {
  const shoe = await db.shoe.findFirst({ where: { id: shoeId, merchantId } });
  if (!shoe) throw new BookingError("Shoe not found");
  if (shoe.status !== "CLEANING") throw new BookingError("This pair isn't waiting for cleaning");
  const retire = atEndOfLife(shoe.wear.toString(), shoe.lifespanDays) || shoe.latestGrade === "D";
  return db.shoe.update({
    where: { id: shoeId },
    data: retire ? { status: "RETIRED", retiredAt: new Date() } : { status: "AVAILABLE" },
  });
}

export async function retireShoe(merchantId: string, shoeId: string) {
  const shoe = await db.shoe.findFirst({ where: { id: shoeId, merchantId } });
  if (!shoe) throw new BookingError("Shoe not found");
  if (!["AVAILABLE", "CLEANING", "DRAFT"].includes(shoe.status)) {
    throw new BookingError("Only pairs that are with you can be retired");
  }
  return db.shoe.update({
    where: { id: shoeId },
    data: { status: "RETIRED", retiredAt: new Date() },
  });
}
