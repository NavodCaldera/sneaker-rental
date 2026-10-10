import "server-only";
import { toD } from "@/lib/decimal";
import { catchUpPhi, incomeBetween } from "@/lib/pricing";
import { cappedWearAdded, wearAdded, wearEnd } from "@/lib/wear-ledger";
import { shoeCurve } from "../catalogue/pricing";
import { db } from "../db";
import { asOfToday, loadHoldings } from "./holdings";

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
        payments: { where: { status: "SUCCEEDED" }, orderBy: { createdAt: "asc" } },
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

  return rentals.map((rental) => ({
    ...rental,
    depositStatus: depositStatus(rental.payments.map((p) => p.kind)),
    items: rental.items.map((item) => {
      let live: { wearSoFar: string; chargeSoFar: string } | null = null;
      if (item.firstDay && (item.status === "ACTIVE" || item.status === "RETURNING")) {
        const added = wearAdded(holdings, item.id, item.lastDay ? undefined : today);
        const wStart = toD(item.shoe.wear);
        const wEnd = wearEnd(wStart, added, item.shoe.lifespanDays);
        const { params, settings, collected } = shoeCurve(item.shoe);
        const phi = settings.catchUp ? catchUpPhi(params, collected, wStart) : toD(item.phi);
        live = {
          wearSoFar: cappedWearAdded(wStart, added, item.shoe.lifespanDays).toString(),
          chargeSoFar: incomeBetween(
            params,
            wStart,
            wEnd,
            toD(item.discount),
            phi,
          ).income.toString(),
        };
      }
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

function depositStatus(kinds: string[]): "held" | "released" | "captured" | "none" {
  if (kinds.includes("DEPOSIT_CAPTURE")) return "captured";
  if (kinds.includes("DEPOSIT_RELEASE")) return "released";
  if (kinds.includes("DEPOSIT_HOLD")) return "held";
  return "none";
}
