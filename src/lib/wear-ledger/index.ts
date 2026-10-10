/**
 * Wear ledger: the only place wear-days are computed (CLAUDE.md rule 1).
 * Pure functions, Decimal results, no I/O. Spec: docs/pricing-spec.md "Wear: the ledger".
 *
 * A wear-day is one calendar day a pair is held. On each day a borrower holds n pairs,
 * each pair gets 1/n wear-day. Holding periods are calendar days in Asia/Colombo and both
 * the first day (delivery) and the last day (the day the borrower ends the rental) count;
 * an open holding (lastDay = null) counts as held.
 */
import type Decimal from "decimal.js";
import { D } from "../decimal";

export {
  type ItemAccrual,
  type Invoice,
  type InvoiceLine,
  type LedgerEntry,
  type LedgerItem,
  type LedgerShoe,
  buildInvoice,
  estimate,
  runLedger,
} from "./accrual";

/** A calendar day number (days since 1970-01-01, Asia/Colombo calendar). */
export type Day = number;

export interface Holding {
  itemId: string;
  /** First day held, inclusive */
  start: Day;
  /** Last day held, inclusive. null = still held. */
  end: Day | null;
}

const MS_PER_DAY = 86_400_000;
/** Asia/Colombo is UTC+05:30 all year (no daylight saving). */
const COLOMBO_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The Colombo calendar day of a moment in time. */
export function colomboDay(date: Date): Day {
  return Math.floor((date.getTime() + COLOMBO_OFFSET_MS) / MS_PER_DAY);
}

/** A day number as a date-only value (UTC midnight), for a Postgres DATE column. */
export function dayToDate(day: Day): Date {
  return new Date(day * MS_PER_DAY);
}

/** A date-only value (UTC midnight, as Postgres DATE columns are read) to its day number. */
export function dateToDay(date: Date): Day {
  return Math.round(date.getTime() / MS_PER_DAY);
}

/** Calendar date 'YYYY-MM-DD' → day number. */
export function dayNumber(isoDate: string): Day {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new RangeError(`Bad date: ${isoDate}`);
  return dateToDay(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * First day for a borrower receiving a pair by direct handoff: the delivery day, unless the
 * borrower handing over still held it that day (they ended the rental that same day), in
 * which case the next day. A shoe is never held by two items on the same day. The giver's
 * last day is the day they ended the rental; waiting days in between are nobody's.
 */
export function receiverFirstDay(deliveredAt: Date, giverLastDay: Day | null): Day {
  const day = colomboDay(deliveredAt);
  return giverLastDay === null ? day : Math.max(day, giverLastDay + 1);
}

/** A holder's planned last day: first day + planned days − 1 (both inclusive). */
export function plannedLastDay(firstDay: Day, plannedDays: number): Day {
  return firstDay + plannedDays - 1;
}

function covers(h: Holding, day: Day) {
  return h.start <= day && (h.end === null || day <= h.end);
}

/**
 * Wear added to one item from its first day through `through` (inclusive): the sum over
 * days of 1/n, where n is the number of the borrower's pairs held that day (the item
 * itself included). Pairs at end of life still count in n. A holding whose last day is
 * before its first day (e.g. received by handoff and returned the same day) adds nothing.
 *
 * @param holdings every holding of the same borrower, including the item itself
 * @param itemId   the item to compute
 * @param through  last day to count; defaults to the item's own last day. Required if open.
 */
export function wearAdded(holdings: Holding[], itemId: string, through?: Day): D {
  const item = holdings.find((h) => h.itemId === itemId);
  if (!item) throw new RangeError(`No holding for item ${itemId}`);
  const last = through ?? item.end;
  if (last === null) throw new RangeError("An open holding needs a `through` day");
  const stop = last + 1; // exclusive bound
  if (stop <= item.start) return new D(0);

  // Phases: maximal day ranges where the set of held items doesn't change.
  const cuts = new Set<Day>([item.start, stop]);
  for (const h of holdings) {
    if (h.start > item.start && h.start < stop) cuts.add(h.start);
    if (h.end !== null && h.end + 1 > item.start && h.end + 1 < stop) cuts.add(h.end + 1);
  }
  const bounds = [...cuts].sort((a, b) => a - b);

  let wear = new D(0);
  for (let i = 0; i < bounds.length - 1; i++) {
    const [from, to] = [bounds[i], bounds[i + 1]];
    const held = holdings.filter((h) => covers(h, from)).length;
    wear = wear.plus(new D(to - from).div(held));
  }
  return wear;
}

/** Wear at the end of a holding: w_start + added, capped at the lifespan L. */
export function wearEnd(
  wearStart: Decimal.Value,
  added: Decimal.Value,
  lifespan: Decimal.Value,
): D {
  return D.min(new D(wearStart).plus(added), lifespan);
}

/** Wear actually added once the cap at L is applied: wearEnd − wStart. */
export function cappedWearAdded(
  wearStart: Decimal.Value,
  added: Decimal.Value,
  lifespan: Decimal.Value,
): D {
  return wearEnd(wearStart, added, lifespan).minus(wearStart);
}

/** Wear-days left before the pair reaches end of life (never negative). */
export function wearRemaining(wear: Decimal.Value, lifespan: Decimal.Value): D {
  return D.max(new D(lifespan).minus(wear), 0);
}

/** Share of the pair's life still left, 0–1. */
export function lifeLeft(wear: Decimal.Value, lifespan: Decimal.Value): D {
  return wearRemaining(wear, lifespan).div(lifespan);
}

/** True once a pair's wear has reached its lifespan. */
export function atEndOfLife(wear: Decimal.Value, lifespan: Decimal.Value): boolean {
  return new D(wear).gte(lifespan);
}
