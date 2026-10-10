import Decimal from "decimal.js";

/**
 * The one Decimal constructor for money and wear values (CLAUDE.md rule 2).
 * High precision for unrounded intermediate values; half-up rounding applies only
 * where a value is shown or charged.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type D = InstanceType<typeof D>;

/** Round to 2 dp for display or charging. Never use on intermediate values. */
export function roundMoney(value: Decimal.Value): D {
  return new D(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
