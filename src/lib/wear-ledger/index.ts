/**
 * Wear ledger: the only place wear-days are computed (CLAUDE.md rule 1).
 * Pure functions, Decimal results, no I/O. Spec: docs/pricing-spec.md "Wear: the ledger".
 *
 * A wear-day is one calendar day a pair is held. On each day a borrower holds n pairs,
 * each pair gets 1/n wear-day. Holding periods are calendar days in Asia/Colombo and both
 * the first day (the day after delivery) and the last day (the day the borrower ends the
 * rental, or the term's last day) count; an open holding (lastDay = null) counts as held.
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

/** Day 1 of a term: the day after delivery. The delivery day itself is free. */
export function firstDayAfterDelivery(deliveredAt: Date): Day {
  return colomboDay(deliveredAt) + 1;
}

/**
 * Day 1 for a borrower receiving a pair by direct handoff: the day after delivery, or the day
 * after the giver's last day if that is later. A shoe is never held by two items on the same
 * day. The giver's last day is the day they ended the rental (or their term's last day);
 * waiting days in between are nobody's.
 */
export function receiverFirstDay(deliveredAt: Date, giverLastDay: Day | null): Day {
  const day = firstDayAfterDelivery(deliveredAt);
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

/**
 * Wear at the end of a holding: w_start + added, capped at the lifespan L unless wear past
 * L is charged (`capAtLife = false`, the shoe's `chargePastLife` setting).
 */
export function wearEnd(
  wearStart: Decimal.Value,
  added: Decimal.Value,
  lifespan: Decimal.Value,
  capAtLife = true,
): D {
  const end = new D(wearStart).plus(added);
  return capAtLife ? D.min(end, lifespan) : end;
}

/** Wear actually added once the cap at L is applied: wearEnd − wStart. */
export function cappedWearAdded(
  wearStart: Decimal.Value,
  added: Decimal.Value,
  lifespan: Decimal.Value,
  capAtLife = true,
): D {
  return wearEnd(wearStart, added, lifespan, capAtLife).minus(wearStart);
}

/**
 * Chain the open items on one pair (pricing-spec.md §6a): the first starts at the pair's
 * settled wear, each later one at the previous one's planned end, each capped at L unless
 * wear past L is charged (`capAtLife = false`). `added`
 * is each item's planned wear in order (from `wearAdded`). The last end is the pair's
 * committed wear.
 */
export function chainWear(
  settledWear: Decimal.Value,
  added: Decimal.Value[],
  lifespan: Decimal.Value,
  capAtLife = true,
): { start: D; end: D }[] {
  let wear = new D(settledWear);
  return added.map((a) => {
    const start = wear;
    wear = wearEnd(start, a, lifespan, capAtLife);
    return { start, end: wear };
  });
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

// ─── Birthday month (product owner, 2026-10-13) ───────────────────────────

/**
 * The days of a borrower's birthday month between `from` and `to` (both inclusive): the
 * calendar month of their date of birth ('YYYY-MM-DD'), every year, clipped to the range.
 * Someone born on 29 February has all of February.
 */
export function birthdayWindows(dateOfBirth: string, from: Day, to: Day): [Day, Day][] {
  const month = Number(dateOfBirth.slice(5, 7)) - 1;
  if (!(month >= 0 && month < 12)) throw new RangeError(`Bad date of birth: ${dateOfBirth}`);
  const windows: [Day, Day][] = [];
  const firstYear = dayToDate(from).getUTCFullYear();
  const lastYear = dayToDate(to).getUTCFullYear();
  for (let year = firstYear; year <= lastYear; year++) {
    const start = dateToDay(new Date(Date.UTC(year, month, 1)));
    const end = dateToDay(new Date(Date.UTC(year, month + 1, 1))) - 1;
    if (end >= from && start <= to) windows.push([Math.max(start, from), Math.min(end, to)]);
  }
  return windows;
}

/**
 * The days an item is rent-free for a birthday: days in `windows` when it is among the first
 * `maxPairs` pairs its borrower holds that day, counting pairs in the order they started (first
 * day, then item id). Returns maximal day ranges, both ends inclusive. A pair stays free once
 * it is: pairs that started earlier only leave, and later ones queue behind it.
 *
 * @param holdings every holding of the same borrower, including the item itself
 * @param through  last day to count; defaults to the item's own last day. Required if open.
 */
export function birthdayFreeRanges(
  holdings: Holding[],
  itemId: string,
  windows: [Day, Day][],
  maxPairs: number,
  through?: Day,
): [Day, Day][] {
  const item = holdings.find((h) => h.itemId === itemId);
  if (!item) throw new RangeError(`No holding for item ${itemId}`);
  const last = through ?? item.end;
  if (last === null) throw new RangeError("An open holding needs a `through` day");
  const before = (h: Holding) =>
    h.start < item.start || (h.start === item.start && h.itemId < item.itemId);
  const ahead = holdings.filter((h) => h.itemId !== itemId && before(h));

  const ranges: [Day, Day][] = [];
  for (const [from, to] of windows) {
    for (let day = Math.max(from, item.start); day <= Math.min(to, last); day++) {
      const free = ahead.filter((h) => covers(h, day)).length < maxPairs;
      if (!free) continue;
      const prev = ranges[ranges.length - 1];
      if (prev && prev[1] === day - 1) prev[1] = day;
      else ranges.push([day, day]);
    }
  }
  return ranges;
}

/**
 * The wear an item gains over each day range, as [before, after] offsets from its starting
 * wear (from `wearAdded`). Add the item's starting wear to get the wear interval to price.
 */
export function wearOverRanges(holdings: Holding[], itemId: string, ranges: [Day, Day][]) {
  return ranges.map(
    ([from, to]) =>
      [wearAdded(holdings, itemId, from - 1), wearAdded(holdings, itemId, to)] as [D, D],
  );
}
