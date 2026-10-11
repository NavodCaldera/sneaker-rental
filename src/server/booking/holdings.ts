import "server-only";
import { type Day, type Holding, colomboDay, dateToDay } from "@/lib/wear-ledger";
import type { Tx } from "../db";

/**
 * Every holding period of one borrower, for the wear ledger (inclusive days). A pair still
 * held counts through its term's last day, the latest it can be held.
 */
export async function loadHoldings(tx: Tx, borrowerId: string): Promise<Holding[]> {
  const items = await tx.rentalItem.findMany({
    where: { rental: { borrowerId }, firstDay: { not: null }, status: { not: "CANCELLED" } },
    select: { id: true, firstDay: true, lastDay: true, termEndDay: true },
  });
  return items.map((i) => {
    const end = i.lastDay ?? i.termEndDay;
    return { itemId: i.id, start: dateToDay(i.firstDay!), end: end ? dateToDay(end) : null };
  });
}

/**
 * Last day counted for "wear so far": what the item would be charged if it reached the
 * next holder today. The return day counts, so today is included.
 */
export function asOfToday(now = new Date()): Day {
  return colomboDay(now);
}
