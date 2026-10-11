import "server-only";
import { colomboDay, dateToDay, dayToDate } from "@/lib/wear-ledger";
import { db } from "../db";
import { getActiveSettings } from "../settings";
import { rentalLocked } from "../wallet";

const isoDay = (day: number) => dayToDate(day).toISOString().slice(0, 10);

/**
 * A borrower's rentals. Each pair shows its term, the rent paid and its planned wear
 * (committed when the term was paid for), plus what the borrower can do next: confirm
 * condition, extend, end early, or answer a price offer.
 */
export async function borrowerRentals(borrowerId: string, now = new Date()) {
  const settings = await getActiveSettings(now);
  const today = colomboDay(now);
  const rentals = await db.rental.findMany({
    where: { borrowerId },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          shoe: {
            include: {
              photos: { where: { kind: "FRONT" }, take: 1 },
              rentalItems: { where: { status: "WAITING_HANDOFF" }, select: { id: true } },
            },
          },
          conditionReports: { select: { stage: true, recordedById: true } },
          deliveries: { orderBy: { createdAt: "desc" } },
          outgoing: { orderBy: { createdAt: "desc" } },
          disputes: { select: { id: true, status: true } },
        },
      },
    },
  });
  const locked = await Promise.all(rentals.map((r) => rentalLocked(r.id)));

  return rentals.map((rental, i) => ({
    ...rental,
    /** Tokens still locked for this rental (the pairs' deposit) */
    locked: locked[i].toFixed(2),
    items: rental.items.map((item) => {
      const needsReceipt =
        item.status === "ACTIVE" && !item.conditionReports.some((r) => r.stage === "RECEIPT");
      const canExtend =
        (item.status === "ACTIVE" || item.status === "AWAITING_DELIVERY") &&
        !item.lastDay &&
        item.shoe.rentalItems.length === 0;
      // Ended, but no driver yet: the next borrower is deciding, or nobody has booked it.
      const keepingForNext =
        item.status === "RETURNING" &&
        !item.outgoing.some((d) => d.status !== "CANCELLED") &&
        !item.deliveries.some((d) => d.type === "COLLECT" && d.status !== "CANCELLED");
      // Ending at once: within the free-return window (wrong size) or on the term's last day.
      const termEnd = item.termEndDay ? dateToDay(item.termEndDay) : null;
      const freeReturn =
        !!item.startDate &&
        now.getTime() - item.startDate.getTime() <= settings.freeReturnHours * 3_600_000;
      const canEndNow =
        item.status === "ACTIVE" && (freeReturn || termEnd === null || today >= termEnd);
      // Ending early needs notice: a last day at least earlyReturnNoticeDays away.
      const earliest =
        item.firstDay && Math.max(today + settings.earlyReturnNoticeDays, dateToDay(item.firstDay));
      const earlyReturn =
        item.status === "ACTIVE" &&
        !item.lastDay &&
        termEnd !== null &&
        earliest &&
        earliest < termEnd
          ? { min: isoDay(earliest), max: isoDay(termEnd - 1) }
          : null;
      return {
        ...item,
        needsReceipt,
        canExtend,
        keepingForNext,
        canEndNow,
        freeReturn,
        earlyReturn,
        noticeDays: settings.earlyReturnNoticeDays,
      };
    }),
  }));
}

/** Pairs a merchant needs to act on: returned (record condition) and cleaning (back in stock). */
export async function merchantReturns(merchantId: string) {
  const [returned, cleaning, inTransit] = await Promise.all([
    db.rentalItem.findMany({
      where: {
        shoe: { merchantId },
        status: "RETURNING",
        endDate: { not: null },
        outgoing: { none: {} },
      },
      include: {
        shoe: { include: { photos: { where: { kind: "FRONT" }, take: 1 } } },
        rental: { include: { borrower: { select: { name: true } } } },
      },
      orderBy: { endDate: "asc" },
    }),
    db.shoe.findMany({
      where: { merchantId, status: "CLEANING", rentalItems: { none: { status: "RETURNING" } } },
      include: { photos: { where: { kind: "FRONT" }, take: 1 } },
    }),
    db.rentalItem.findMany({
      where: { shoe: { merchantId }, status: "RETURNING", endDate: null },
      include: {
        shoe: true,
        deliveries: { where: { status: { not: "CANCELLED" } } },
        outgoing: { where: { status: { not: "CANCELLED" } } },
      },
    }),
  ]);
  return { returned, cleaning, inTransit };
}
