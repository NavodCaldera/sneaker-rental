/**
 * Daily accrual: the reference algorithm for wear and rent (pricing-spec.md "Wear: the ledger").
 * For each borrower and day, n = pairs that borrower holds that day; each held shoe gains
 * min(1/n, L − wear) and accrues (1 − d) · φ · K · [IQ(w + δ) − IQ(w)].
 *
 * Accruing day by day gives exactly the same total as one formula per item, because every
 * charge is a difference of IQ and the in-between values cancel. The app closes items with
 * the phase-based `wearAdded`; this runs estimates and the acceptance scenarios.
 */
import type Decimal from "decimal.js";
import { D } from "../decimal";
import {
  type CurveParams,
  type DiscountFunding,
  rentIntegral,
  assertDiscount,
  catchUpPhi,
  chargedAmounts,
  shownPrice,
} from "../pricing";
import type { Day } from "./index";

export interface LedgerShoe {
  id: string;
  curve: CurveParams;
  /** Wear-days used so far */
  wear: D;
  /** Collected over its whole life so far, after discounts (see lifetimeCollected) */
  collected: D;
  lostToDiscounts: D;
  /** Catch-up (Option B) from the shoe's settings version */
  catchUp: boolean;
}

export interface LedgerItem {
  id: string;
  borrowerId: string;
  shoeId: string;
  /** First day held, inclusive */
  start: Day;
  /** Last day held, inclusive; null = still held */
  end: Day | null;
  /** One-off discount for this item, 0 by default */
  discount?: Decimal.Value;
  /** "merchant" for idle discounts: the platform keeps its full share */
  discountFundedBy?: DiscountFunding;
}

export interface ItemAccrual {
  itemId: string;
  shoeId: string;
  daysHeld: number;
  wearStart: D;
  wearEnd: D;
  wearAdded: D;
  phi: D;
  discount: D;
  discountFundedBy: DiscountFunding;
  /** Shown price per wear-day at pickup */
  priceStart: D;
  /** Shown price per wear-day after the last day accrued */
  priceEnd: D;
  /** Charge before discount, unrounded */
  gross: D;
  /** Charge after discount, unrounded */
  amount: D;
  /** Wear-days held after the shoe reached end of life */
  uncharged: D;
}

export interface LedgerEntry {
  day: Day;
  itemId: string;
  shoeId: string;
  n: number;
  wearBefore: D;
  wearAfter: D;
  /** Unrounded */
  amount: D;
}

/**
 * Accrue wear and rent for every item over days fromDay..toDay (inclusive). Mutates `shoes`.
 * φ and the discount are fixed on an item's first accrued day.
 */
export function runLedger(
  items: LedgerItem[],
  shoes: Map<string, LedgerShoe>,
  fromDay: Day,
  toDay: Day,
  options: { maxPairs: number },
): { results: Map<string, ItemAccrual>; entries: LedgerEntry[] } {
  const results = new Map<string, ItemAccrual>();
  const entries: LedgerEntry[] = [];

  for (const it of items) {
    assertDiscount(it.discount ?? 0);
    if (!shoes.has(it.shoeId)) throw new Error(`Unknown shoe ${it.shoeId}`);
    if (it.end !== null && it.end < it.start) {
      throw new RangeError(`Item ${it.id} ends before it starts`);
    }
  }
  checkNoDoubleBooking(items);

  // IQ at each shoe's current wear, carried from one day to the next.
  const iqNow = new Map<string, D>();

  for (let day = fromDay; day <= toDay; day++) {
    const byBorrower = new Map<string, LedgerItem[]>();
    for (const it of items) {
      if (it.start <= day && (it.end === null || day <= it.end)) {
        byBorrower.set(it.borrowerId, [...(byBorrower.get(it.borrowerId) ?? []), it]);
      }
    }
    for (const [borrower, held] of byBorrower) {
      const n = held.length;
      if (n > options.maxPairs) {
        throw new RangeError(`Borrower ${borrower} holds ${n} pairs on day ${day}`);
      }
      for (const it of held) {
        const shoe = shoes.get(it.shoeId)!;
        const c = shoe.curve;
        let r = results.get(it.id);
        if (!r) {
          const discount = new D(it.discount ?? 0);
          const phi = shoe.catchUp ? catchUpPhi(c, shoe.collected, shoe.wear) : new D(1);
          r = {
            itemId: it.id,
            shoeId: it.shoeId,
            daysHeld: 0,
            wearStart: shoe.wear,
            wearEnd: shoe.wear,
            wearAdded: new D(0),
            phi,
            discount,
            discountFundedBy: it.discountFundedBy ?? "platform",
            priceStart: shownPrice(c, shoe.wear, discount, phi),
            priceEnd: shownPrice(c, shoe.wear, discount, phi),
            gross: new D(0),
            amount: new D(0),
            uncharged: new D(0),
          };
          results.set(it.id, r);
        }
        const share = new D(1).div(n);
        const before = shoe.wear;
        // Past L, wear keeps counting (and is charged at P(L)) only if the shoe's settings
        // say so; otherwise the pair gains nothing and the share is reported as uncharged.
        const dw = c.pastLife ? share : D.min(share, D.max(0, c.L.minus(before)));
        const after = before.plus(dw);
        const iqBefore = iqNow.get(shoe.id) ?? rentIntegral(c, before);
        const iqAfter = rentIntegral(c, after);
        iqNow.set(shoe.id, iqAfter);
        const gross = r.phi.times(c.K).times(iqAfter.minus(iqBefore));
        const amount = new D(1).minus(r.discount).times(gross);

        shoe.wear = after;
        shoe.collected = shoe.collected.plus(amount);
        shoe.lostToDiscounts = shoe.lostToDiscounts.plus(gross.minus(amount));
        r.daysHeld += 1;
        r.wearEnd = after;
        r.wearAdded = r.wearAdded.plus(dw);
        r.uncharged = r.uncharged.plus(share.minus(dw));
        r.gross = r.gross.plus(gross);
        r.amount = r.amount.plus(amount);
        r.priceEnd = shownPrice(c, after, r.discount, r.phi);
        entries.push({
          day,
          itemId: it.id,
          shoeId: it.shoeId,
          n,
          wearBefore: before,
          wearAfter: after,
          amount,
        });
      }
    }
  }
  return { results, entries };
}

/** A pair can only be in one place: two items for the same shoe must not overlap. */
function checkNoDoubleBooking(items: LedgerItem[]): void {
  const byShoe = new Map<string, LedgerItem[]>();
  for (const it of items) byShoe.set(it.shoeId, [...(byShoe.get(it.shoeId) ?? []), it]);
  for (const [shoe, list] of byShoe) {
    const sorted = [...list].sort((x, y) => x.start - y.start);
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = sorted[i - 1].end ?? Number.POSITIVE_INFINITY;
      if (sorted[i].start <= prevEnd) {
        throw new Error(`Shoe ${shoe} is double-booked (${sorted[i - 1].id}, ${sorted[i].id})`);
      }
    }
  }
}

export interface InvoiceLine extends ItemAccrual {
  charge: D;
  discountGiven: D;
  merchantShare: D;
  platformShare: D;
}

export interface Invoice {
  lines: InvoiceLine[];
  /** Sum of the rounded lines */
  total: D;
  totalUnrounded: D;
  merchantTotal: D;
  platformTotal: D;
}

/**
 * Round and split each accrued item merchant-first with chargedAmounts().
 * `merchantOutstandingFor(shoeId)` is what the shoe's merchant is still owed before these
 * items; it is carried from one item to the next for the same shoe, in accrual order.
 * A merchant-funded discount lowers the merchant's target by its cost.
 */
export function buildInvoice(
  results: Iterable<ItemAccrual>,
  merchantOutstandingFor: (shoeId: string) => Decimal.Value,
): Invoice {
  const outstanding = new Map<string, D>();
  const lines: InvoiceLine[] = [];
  for (const r of results) {
    let owed = outstanding.get(r.shoeId) ?? new D(merchantOutstandingFor(r.shoeId));
    if (r.discountFundedBy === "merchant") owed = D.max(0, owed.minus(r.gross.minus(r.amount)));
    const amounts = chargedAmounts(r.amount, { merchantOutstanding: owed, undiscounted: r.gross });
    outstanding.set(r.shoeId, owed.minus(amounts.merchantShare));
    lines.push({ ...r, ...amounts });
  }
  const sum = (f: (l: InvoiceLine) => D) => lines.reduce((t, l) => t.plus(f(l)), new D(0));
  return {
    lines,
    total: sum((l) => l.charge),
    totalUnrounded: sum((l) => l.amount),
    merchantTotal: sum((l) => l.merchantShare),
    platformTotal: sum((l) => l.platformShare),
  };
}

/**
 * Estimate at booking: run the ledger on copies of the shoes over the planned dates, so
 * shoe state is left unchanged. The pre-authorisation is this estimate plus the deposit.
 */
export function estimate(
  items: LedgerItem[],
  shoes: Map<string, LedgerShoe>,
  merchantOutstandingFor: (shoeId: string) => Decimal.Value,
  options: { maxPairs: number },
): Invoice {
  if (items.length === 0) return buildInvoice([], merchantOutstandingFor);
  if (items.some((it) => it.end === null)) {
    throw new Error("An estimate needs a planned last day for every item");
  }
  const copy = new Map([...shoes].map(([k, v]) => [k, { ...v }]));
  const from = Math.min(...items.map((it) => it.start));
  const to = Math.max(...items.map((it) => it.end as number));
  return buildInvoice(
    runLedger(items, copy, from, to, options).results.values(),
    merchantOutstandingFor,
  );
}
