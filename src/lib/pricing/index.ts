/**
 * Pricing engine: the only place prices, charges and shares are computed (CLAUDE.md rule 1).
 * Pure functions, Decimal in and out, no I/O. Spec: docs/pricing-spec.md.
 */
export { DEFAULT_PRICING_SETTINGS, type PricingSettings } from "./settings";
export {
  type CurveParams,
  curveIncome,
  curveParams,
  curvePoints,
  IQ,
  priceAt,
  Q,
  shownPrice,
  targetIncome,
  validateListing,
} from "./curve";
export {
  assertDiscount,
  breakEvenIdleDays,
  bundleDailyCost,
  catchUpPhi,
  chargedAmounts,
  type DiscountFunding,
  idleCostPerDay,
  incomeBetween,
  lifetimeCollected,
  merchantOutstanding,
  merchantTarget,
  releaseDiscount,
  releaseWindowStart,
  remainingValue,
  splitCharge,
} from "./charges";
export { roundMoney } from "../decimal";
