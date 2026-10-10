import "server-only";
import { toD } from "@/lib/decimal";
import { curveParams, incomeBetween } from "@/lib/pricing";
import { wearAdded, wearEnd } from "@/lib/wear-ledger";
import { db } from "../db";
import { getActiveSettings, toPricingSettings } from "../settings";
import { asOfToday, loadHoldings } from "./holdings";

/** A borrower's rentals, with wear so far and the running charge for pairs still held. */
export async function borrowerRentals(borrowerId: string, now = new Date()) {
  const [rentals, holdings, settingsRow] = await Promise.all([
    db.rental.findMany({
      where: { borrowerId },
      orderBy: { createdAt: "desc" },
      include: {
        payments: { where: { status: "SUCCEEDED" }, orderBy: { createdAt: "asc" } },
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            shoe: { include: { photos: { where: { kind: "FRONT" }, take: 1 } } },
            conditionReports: { select: { stage: true, recordedById: true } },
            deliveries: { orderBy: { createdAt: "desc" } },
            outgoing: { orderBy: { createdAt: "desc" } },
            disputes: { select: { id: true, status: true } },
          },
        },
      },
    }),
    loadHoldings(db, borrowerId),
    getActiveSettings(),
  ]);
  const settings = toPricingSettings(settingsRow);
  const today = asOfToday(now);

  return rentals.map((rental) => ({
    ...rental,
    depositStatus: depositStatus(rental.payments.map((p) => p.kind)),
    items: rental.items.map((item) => {
      let live: { wearSoFar: string; chargeSoFar: string } | null = null;
      if (item.startDate && (item.status === "ACTIVE" || item.status === "RETURNING")) {
        const added = wearAdded(holdings, item.id, item.endDate ? undefined : today);
        const wStart = toD(item.shoe.wear);
        const wEnd = wearEnd(wStart, added, item.shoe.lifespanDays);
        const params = curveParams(toD(item.shoe.value), item.shoe.lifespanDays, settings);
        live = {
          wearSoFar: wEnd.minus(wStart).toString(),
          chargeSoFar: incomeBetween(
            params,
            wStart,
            wEnd,
            toD(item.discount),
            toD(item.phi),
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
