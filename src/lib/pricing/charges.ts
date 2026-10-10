import type Decimal from "decimal.js";
import { D, roundMoney } from "../decimal";
import { type CurveParams, IQ, curveIncome } from "./curve";
import type { PricingSettings } from "./settings";

const ONE = new D(1);

/**
 * Income for one rental item moving the shoe from wStart to wEnd
 * (docs/pricing-spec.md "Charges"). wEnd is clamped to L.
 * Discounts apply to this item only; they never change the curve for the next item.
 */
export function incomeBetween(
  p: CurveParams,
  wStart: Decimal.Value,
  wEnd: Decimal.Value,
  discount: Decimal.Value = 0,
  phi: Decimal.Value = 1,
): { income: D; undiscounted: D; discountCost: D } {
  const d = new D(discount);
  if (d.lt(0) || d.gte(1)) throw new RangeError("Discount must be in [0, 1)");
  const start = new D(wStart);
  const end = new D(wEnd);
  if (end.lt(start)) throw new RangeError("wEnd must be ≥ wStart");

  const undiscounted = new D(phi).times(p.K).times(IQ(p, end).minus(IQ(p, start)));
  const discountCost = undiscounted.times(d);
  return { income: undiscounted.minus(discountCost), undiscounted, discountCost };
}

/**
 * Catch-up multiplier φ so a discounted shoe still reaches R:
 * φ = (R − collectedSoFar) / (K · [IQ(L) − IQ(w)]). Off at launch (φ = 1).
 * Returns 1 when nothing is left to earn.
 */
export function catchUpPhi(p: CurveParams, collectedSoFar: Decimal.Value, w: Decimal.Value): D {
  const remainingCurve = p.K.times(p.A.minus(IQ(p, w)));
  if (remainingCurve.lte(0)) return new D(1);
  return p.R.minus(collectedSoFar).div(remainingCurve);
}

/** What the shoe still had left to earn at wear w: R − F(w). Lost shoe and buy-out. */
export function remainingValue(p: CurveParams, w: Decimal.Value): D {
  return p.R.minus(curveIncome(p, w));
}

export type DiscountFunding = "platform" | "merchant";

/**
 * Split a charge between merchant and platform (§4 rule 4).
 * - No discount, or a platform promotion: both shares shrink in proportion.
 * - Merchant idle discount: the platform share is taken on the undiscounted income,
 *   so the discount comes out of the merchant share only.
 */
export function splitCharge(
  settings: PricingSettings,
  charge: Decimal.Value,
  options: { undiscounted?: Decimal.Value; fundedBy?: DiscountFunding } = {},
): { merchant: D; platform: D } {
  const total = ONE.plus(settings.merchantMargin).plus(settings.platformMargin);
  const amount = new D(charge);
  const base =
    options.fundedBy === "merchant" && options.undiscounted !== undefined
      ? new D(options.undiscounted)
      : amount;
  const platform = base.times(settings.platformMargin).div(total);
  return { merchant: amount.minus(platform), platform };
}

/**
 * Pre-authorisation estimate for holding `pairCount` pairs together for `days` days.
 * Each pair accrues days / pairCount wear (the 1/n split), capped at L.
 */
export function estimateItem(
  p: CurveParams,
  wStart: Decimal.Value,
  days: Decimal.Value,
  pairCount: number,
): { wearAdded: D; charge: D } {
  if (!Number.isInteger(pairCount) || pairCount < 1) throw new RangeError("pairCount must be ≥ 1");
  const start = new D(wStart);
  const end = D.min(start.plus(new D(days).div(pairCount)), p.L);
  return { wearAdded: end.minus(start), charge: incomeBetween(p, start, end).income };
}

/**
 * Daily cost of a bundle at today's wear: each pair is charged P(w_i) for 1/n wear-day.
 * `prices` are the pairs' current P(w).
 */
export function bundleDailyCost(prices: Decimal.Value[]): D {
  if (prices.length === 0) return new D(0);
  return prices.reduce<D>((sum, price) => sum.plus(price), new D(0)).div(prices.length);
}

/**
 * Charged amounts for one item, rounded to 2 dp (CLAUDE.md rule 2): the charge and the
 * merchant share are rounded; the platform share is the remainder, so the two always add
 * up to the charge to the cent.
 */
export function chargedAmounts(
  settings: PricingSettings,
  income: Decimal.Value,
  options: { undiscounted?: Decimal.Value; fundedBy?: DiscountFunding } = {},
): { charge: D; merchantShare: D; platformShare: D } {
  const split = splitCharge(settings, income, options);
  const charge = roundMoney(income);
  const merchantShare = roundMoney(split.merchant);
  return { charge, merchantShare, platformShare: charge.minus(merchantShare) };
}
