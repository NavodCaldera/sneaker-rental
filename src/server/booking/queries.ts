import "server-only";
import { type D, toD } from "@/lib/decimal";
import { catchUpPhi, incomeBetween } from "@/lib/pricing";
import { type Day, type Holding, cappedWearAdded, wearAdded, wearEnd } from "@/lib/wear-ledger";
import { type PricedShoe, shoeCurve } from "../catalogue/pricing";
import { db } from "../db";
import { rentalLocked } from "../wallet";
import { asOfToday, loadHoldings } from "./holdings";

type LiveItem = {
  id: string;
  status: string;
  firstDay: Date | null;
  lastDay: Date | null;
  discount: { toString(): string };
  phi: { toString(): string };
  shoe: PricedShoe & { lifespanDays: number };
};

/**
 * Wear and rent so far for a pair still held (or on its way back): what it would cost if
 * its holding ended today, or on its last day if the borrower already ended it. Wear from
 * the ledger, rent from the pricing engine. Null for pairs not yet delivered or settled.
 */
export function liveCharge(
  item: LiveItem,
  holdings: Holding[],
  today: Day,
): { wearSoFar: D; chargeSoFar: D; wearNow: D } | null {
  if (!item.firstDay || (item.status !== "ACTIVE" && item.status !== "RETURNING")) return null;
  const added = wearAdded(holdings, item.id, item.lastDay ? undefined : today);
  const wStart = toD(item.shoe.wear);
  const wEnd = wearEnd(wStart, added, item.shoe.lifespanDays);
  const { params, settings, collected } = shoeCurve(item.shoe);
  const phi = settings.catchUp ? catchUpPhi(params, collected, wStart) : toD(item.phi);
  return {
    wearSoFar: cappedWearAdded(wStart, added, item.shoe.lifespanDays),
    chargeSoFar: incomeBetween(params, wStart, wEnd, toD(item.discount), phi).income,
    wearNow: wEnd,
  };
}

/**
 * A borrower's rentals, with wear so far and the running charge for pairs still held:
 * what each pair would cost if it reached the next holder today (today counts).
 */
export async function borrowerRentals(borrowerId: string, now = new Date()) {
  const [rentals, holdings] = await Promise.all([
    db.rental.findMany({
      where: { borrowerId },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            shoe: {
              include: { photos: { where: { kind: "FRONT" }, take: 1 }, settings: true },
            },
            conditionReports: { select: { stage: true, recordedById: true } },
            deliveries: { orderBy: { createdAt: "desc" } },
            outgoing: { orderBy: { createdAt: "desc" } },
            disputes: { select: { id: true, status: true } },
          },
        },
      },
    }),
    loadHoldings(db, borrowerId),
  ]);
  const today = asOfToday(now);
  const locked = await Promise.all(rentals.map((r) => rentalLocked(r.id)));

  return rentals.map((rental, i) => ({
    ...rental,
    /** Tokens still locked for this rental */
    locked: locked[i].toFixed(2),
    items: rental.items.map((item) => {
      const charge = liveCharge(item, holdings, today);
      const live = charge && {
        wearSoFar: charge.wearSoFar.toString(),
        chargeSoFar: charge.chargeSoFar.toString(),
      };
      const needsReceipt =
        item.status === "ACTIVE" && !item.conditionReports.some((r) => r.stage === "RECEIPT");
      return { ...item, live, needsReceipt };
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
      include: { shoe: true, deliveries: true },
    }),
  ]);
  return { returned, cleaning, inTransit };
}
