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
  targetIncome,
} from "./curve";
export {
  bundleDailyCost,
  catchUpPhi,
  chargedAmounts,
  type DiscountFunding,
  estimateItem,
  incomeBetween,
  remainingValue,
  splitCharge,
} from "./charges";
export { roundMoney } from "../decimal";
