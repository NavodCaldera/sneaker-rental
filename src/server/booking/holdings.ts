import "server-only";
import { type Day, type Holding, colomboDay } from "@/lib/wear-ledger";
import type { Tx } from "../db";

/** Every holding period of one borrower, for the wear ledger. */
export async function loadHoldings(tx: Tx, borrowerId: string): Promise<Holding[]> {
  const items = await tx.rentalItem.findMany({
    where: { rental: { borrowerId }, startDate: { not: null }, status: { not: "CANCELLED" } },
    select: { id: true, startDate: true, endDate: true },
  });
  return items.map((i) => ({
    itemId: i.id,
    start: colomboDay(i.startDate!),
    end: i.endDate ? colomboDay(i.endDate) : null,
  }));
}

/**
 * Exclusive day bound for "wear so far": what the item would be charged if its holding
 * ended today. Matches close-out, where the end day itself isn't counted.
 */
export function asOfToday(now = new Date()): Day {
  return colomboDay(now);
}
