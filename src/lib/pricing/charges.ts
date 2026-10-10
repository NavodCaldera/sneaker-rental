import type Decimal from "decimal.js";
import { D, roundMoney } from "../decimal";
import { type CurveParams, IQ, curveIncome } from "./curve";
import type { PricingSettings } from "./settings";

const ONE = new D(1);

/**
 * Income for one rental item moving the shoe from wStart to wEnd
 * (docs/pricing-spec.md "Prices"). wEnd is clamped to L.
 * Discounts apply to this item only; they never change the curve for the next item.
 */
export function incomeBetween(
  p: CurveParams,
  wStart: Decimal.Value,
  wEnd: Decimal.Value,
  discount: Decimal.Value = 0,
  phi: Decimal.Value = 1,
): { income: D; undiscounted: D; discountCost: D } {
  assertDiscount(discount);
  const start = new D(wStart);
  const end = new D(wEnd);
  if (end.lt(start)) throw new RangeError("wEnd must be ≥ wStart");

  const undiscounted = new D(phi).times(p.K).times(IQ(p, end).minus(IQ(p, start)));
  const discountCost = undiscounted.times(discount);
  return { income: undiscounted.minus(discountCost), undiscounted, discountCost };
}

export function assertDiscount(discount: Decimal.Value): void {
  const d = new D(discount);
  if (d.lt(0) || d.gte(1)) throw new RangeError("Discount must be in [0, 1)");
}

/**
 * What a shoe has collected over its whole life: the curve income for wear it had when
 * listed second-hand, F(w₀), plus what the platform actually charged (after discounts).
 */
export function lifetimeCollected(
  p: CurveParams,
  initialWear: Decimal.Value,
  collectedOnPlatform: Decimal.Value,
): D {
  return curveIncome(p, initialWear).plus(collectedOnPlatform);
}

/**
 * Option B catch-up multiplier φ at wear w, so a discounted shoe still reaches R:
 * φ = (R − collected) / (K · [A − IQ(w)]). `collected` is lifetimeCollected().
 * Returns 1 when nothing is left to earn. Fixed at the start of each rental item.
 */
export function catchUpPhi(p: CurveParams, collected: Decimal.Value, w: Decimal.Value): D {
  const remainingCurve = p.K.times(p.A.minus(IQ(p, w)));
  if (remainingCurve.lte(0)) return new D(1);
  return D.max(0, p.R.minus(collected).div(remainingCurve));
}

/**
 * What the shoe still had left to earn at wear w. Charged for a lost shoe and used as the
 * "buy it now" price. Without catch-up the curve would only collect K · (A − IQ(w));
 * with catch-up, R − collected (`collected` is lifetimeCollected()).
 */
export function remainingValue(
  p: CurveParams,
  w: Decimal.Value,
  collected: Decimal.Value,
  settings: Pick<PricingSettings, "catchUp">,
): D {
  if (settings.catchUp) return D.max(0, p.R.minus(collected));
  return p.R.minus(curveIncome(p, w));
}

export type DiscountFunding = "platform" | "merchant";

/** Platform's fraction of any amount: μp / (1 + μm + μp). */
function platformFraction(settings: PricingSettings): D {
  return new D(settings.platformMargin).div(
    ONE.plus(settings.merchantMargin).plus(settings.platformMargin),
  );
}

/**
 * Exact (unrounded) split of an amount between merchant and platform, for previews such
 * as "you earn over its life". Charged amounts use chargedAmounts() instead.
 */
export function splitCharge(
  settings: PricingSettings,
  amount: Decimal.Value,
): { merchant: D; platform: D } {
  const platform = new D(amount).times(platformFraction(settings));
  return { merchant: new D(amount).minus(platform), platform };
}

/**
 * Charged amounts for one item, rounded to 2 dp (pricing-spec.md "Closing an item"):
 * - charged = round(income), the only rounding of the charge;
 * - platform share = round(charged · μp / (1 + μm + μp)); the merchant gets the rest, so
 *   the two always add up to the cent;
 * - merchant-funded idle discount (§4 rule 4): the platform share is taken on the rounded
 *   undiscounted charge, so the discount comes out of the merchant's share only;
 * - discountGiven = round(undiscounted) − charged.
 */
export function chargedAmounts(
  settings: PricingSettings,
  income: Decimal.Value,
  options: { undiscounted?: Decimal.Value; fundedBy?: DiscountFunding } = {},
): { charge: D; merchantShare: D; platformShare: D; discountGiven: D } {
  const charge = roundMoney(income);
  const gross = roundMoney(options.undiscounted ?? income);
  const fraction = platformFraction(settings);
  const platformShare =
    options.fundedBy === "merchant"
      ? D.min(charge, roundMoney(gross.times(fraction)))
      : roundMoney(charge.times(fraction));
  return {
    charge,
    merchantShare: charge.minus(platformShare),
    platformShare,
    discountGiven: gross.minus(charge),
  };
}

/**
 * Daily cost of a bundle at today's wear: each pair is charged P(w_i) for 1/n wear-day.
 * `prices` are the pairs' current P(w).
 */
export function bundleDailyCost(prices: Decimal.Value[]): D {
  if (prices.length === 0) return new D(0);
  return prices.reduce<D>((sum, price) => sum.plus(price), new D(0)).div(prices.length);
}

// ─── Idle-cost test (Phase 2 discount ladder) ──────────────────────────────

/** Idle cost per day c = V · r / 365 + h. */
export function idleCostPerDay(V: Decimal.Value, settings: PricingSettings): D {
  return new D(V).times(settings.capitalRate).div(365).plus(settings.holdCostPerDay);
}

/**
 * Idle days a discount d must avoid to pay for itself, for an expected rental moving the
 * shoe from wStart to wEnd: d · gross / c. Offer the discount only if it is expected to
 * save at least that many idle days.
 */
export function breakEvenIdleDays(
  p: CurveParams,
  wStart: Decimal.Value,
  wEnd: Decimal.Value,
  discount: Decimal.Value,
  settings: PricingSettings,
): D {
  const { undiscounted } = incomeBetween(p, wStart, wEnd);
  return new D(discount).times(undiscounted).div(idleCostPerDay(p.V, settings));
}
