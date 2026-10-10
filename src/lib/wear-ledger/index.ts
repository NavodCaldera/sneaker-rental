/**
 * Wear ledger: the only place wear-days are computed (CLAUDE.md rule 1).
 * Pure functions, Decimal results, no I/O. Spec: docs/pricing-spec.md "Wear ledger".
 *
 * A wear-day is one calendar day a pair is held. On each day a borrower holds n pairs,
 * each pair gets 1/n wear-day. Holding periods are half-open [start, end) in calendar
 * days (Asia/Colombo); an open holding (end = null) counts as held.
 */
import type Decimal from "decimal.js";
import { D } from "../decimal";

/** A calendar day number (days since 1970-01-01 in Asia/Colombo). */
export type Day = number;

export interface Holding {
  itemId: string;
  start: Day;
  /** Exclusive. null = still held. */
  end: Day | null;
}

const MS_PER_DAY = 86_400_000;
/** Asia/Colombo is UTC+05:30 all year (no daylight saving). */
const COLOMBO_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function colomboDay(date: Date): Day {
  return Math.floor((date.getTime() + COLOMBO_OFFSET_MS) / MS_PER_DAY);
}

function covers(h: Holding, day: Day) {
  return h.start <= day && (h.end === null || day < h.end);
}

/**
 * Wear added to one item over [start, until): sum over days of 1/n, where n is the number
 * of the borrower's pairs held that day (the item itself included).
 *
 * @param holdings every holding of the same borrower, including the item itself
 * @param itemId   the item to compute
 * @param until    exclusive end day; defaults to the item's own end. Required if it's open.
 */
export function wearAdded(holdings: Holding[], itemId: string, until?: Day): D {
  const item = holdings.find((h) => h.itemId === itemId);
  if (!item) throw new RangeError(`No holding for item ${itemId}`);
  const end = until ?? item.end;
  if (end === null) throw new RangeError("An open holding needs an `until` day");
  if (end <= item.start) return new D(0);

  // Phases: maximal day ranges where the set of held items doesn't change.
  const cuts = new Set<Day>([item.start, end]);
  for (const h of holdings) {
    if (h.start > item.start && h.start < end) cuts.add(h.start);
    if (h.end !== null && h.end > item.start && h.end < end) cuts.add(h.end);
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
