import "server-only";
import type { Delivery, Grade } from "@/generated/prisma/client";
import { toD } from "@/lib/decimal";
import { catchUpPhi, chargedAmounts, incomeBetween } from "@/lib/pricing";
import {
  atEndOfLife,
  colomboDay,
  dateToDay,
  dayToDate,
  receiverFirstDay,
  wearAdded,
  wearEnd,
} from "@/lib/wear-ledger";
import { merchantFundedDiscounts, merchantOwed, shoeCurve } from "../catalogue/pricing";
import { type Tx, db } from "../db";
import { requestDelivery } from "../logistics/requests";
import { settleItems } from "../payments";
import { type SettingsRow, getActiveSettings } from "../settings";
import { checkPhoto, savePhoto } from "../storage";
import { BookingError } from "./checkout";
import { asOfToday, loadHoldings } from "./holdings";

// ─── Borrower ends a pair (§5.3) ───────────────────────────────────────────

/**
 * The borrower ends a pair. If another borrower has reserved it, a direct handoff is
 * requested; otherwise it goes back to the merchant for cleaning.
 */
export async function endRental(borrowerId: string, itemId: string, now = new Date()) {
  const settings = await getActiveSettings();
  return db.$transaction(async (tx) => {
    const item = await tx.rentalItem.findFirst({
      where: { id: itemId, rental: { borrowerId } },
      include: { rental: true, shoe: true },
    });
    if (!item) throw new BookingError("Rental not found");
    if (item.status !== "ACTIVE") throw new BookingError("Only pairs you hold can be ended");

    const freeReturn =
      !!item.startDate &&
      now.getTime() - item.startDate.getTime() <= settings.freeReturnHours * 3_600_000;
    await tx.rentalItem.update({
      where: { id: item.id },
      // Charging and wear stop today: waiting for the driver is free (pricing-spec.md §5).
      data: {
        status: "RETURNING",
        returnRequestedAt: now,
        lastDay: dayToDate(colomboDay(now)),
        freeReturn,
      },
    });

    const next = await tx.rentalItem.findFirst({
      where: { shoeId: item.shoeId, status: "WAITING_HANDOFF" },
      include: { rental: true },
      orderBy: { createdAt: "asc" },
    });

    // Don't hand off a pair that will reach end of life with this holding.
    const holdings = await loadHoldings(tx, borrowerId);
    const projected = wearEnd(
      item.shoe.wear.toString(),
      wearAdded(holdings, item.id, asOfToday(now)),
      item.shoe.lifespanDays,
    );
    const endOfLife = atEndOfLife(projected, item.shoe.lifespanDays);

    if (next && !endOfLife) {
      return requestDelivery(tx, {
        type: "HANDOFF",
        rentalItemId: next.id,
        fromRentalItemId: item.id,
        fromAddress: item.rental.deliveryAddress,
        toAddress: next.rental.deliveryAddress,
        bookingFee: settings.deliveryBookingFee?.toString() ?? null,
      });
    }
    if (next && endOfLife) {
      await tx.rentalItem.update({ where: { id: next.id }, data: { status: "CANCELLED" } });
    }
    return requestDelivery(tx, {
      type: "COLLECT",
      rentalItemId: item.id,
      fromAddress: item.rental.deliveryAddress,
      toAddress: item.shoe.pickupAddress,
      // OPEN DECISION: who pays for return trips. Free returns are on the platform.
      paidBy: freeReturn ? "PLATFORM" : "BORROWER",
      bookingFee: settings.deliveryBookingFee?.toString() ?? null,
    });
  });
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
 * Delivery arrived. The holding starts on the delivery date for the receiving borrower (the
 * day after, if the borrower handing over ended their rental that same day). The returning
 * or handing-over borrower's last day was set when they ended the rental; the delivery time
 * is recorded as `endDate` (pricing-spec.md §5).
 */
export async function onDeliveryDelivered(tx: Tx, delivery: Delivery, at: Date) {
  const item = await tx.rentalItem.findUniqueOrThrow({ where: { id: delivery.rentalItemId } });
  const today = dayToDate(colomboDay(at));
  switch (delivery.type) {
    case "DELIVER":
      await tx.rentalItem.update({
        where: { id: item.id },
        data: { status: "ACTIVE", startDate: at, firstDay: today },
      });
      await tx.shoe.update({ where: { id: item.shoeId }, data: { status: "WITH_BORROWER" } });
      break;
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
      const firstDay = receiverFirstDay(at, giverLastDay);
      await tx.rentalItem.update({
        where: { id: item.id },
        data: { status: "ACTIVE", startDate: at, firstDay: dayToDate(firstDay) },
      });
      await tx.shoe.update({ where: { id: item.shoeId }, data: { status: "WITH_BORROWER" } });
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

  // Charge the closed items and release deposits that are no longer needed.
  await settleItems(result.closedItemIds);
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
 * the shoe's own settings version, stored on the item and rolled into the shoe.
 * Idempotent: a closed item is left alone. `settingsRow` (the active version) sets the
 * dispute window.
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
  const wEnd = wearEnd(wStart, added, item.shoe.lifespanDays);

  // φ is fixed at the start of the item, from the shoe's state before this rental.
  const { params, settings, collected } = shoeCurve(item.shoe);
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

  const open = await tx.rentalItem.count({
    where: { rentalId: item.rentalId, status: { notIn: ["CLOSED", "CANCELLED", "LOST"] } },
  });
  if (open === 0) {
    await tx.rental.update({
      where: { id: item.rentalId },
      data: { status: "CLOSED", closedAt: now },
    });
  }
  return closed;
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
