import type Decimal from "decimal.js";
import { D } from "../decimal";

/**
 * Pricing settings, passed in by the caller. The engine never reads config itself.
 * Mirrors the PricingSettings entity (business-model.md §8).
 */
export interface PricingSettings {
  /** Merchant margin μm */
  merchantMargin: Decimal.Value;
  /** Platform margin μp */
  platformMargin: Decimal.Value;
  /** Floor q: end-of-life price as a fraction of the new price */
  floor: Decimal.Value;
  /** Midpoint as a fraction of L (200/365 for the base curve) */
  midpointRatio: Decimal.Value;
  /** Steepness at L = 365; scaled by 365/L */
  baseSteepness: Decimal.Value;
}

/** Launch defaults (CLAUDE.md "Launch defaults"). */
export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  merchantMargin: "0.10",
  platformMargin: "0.10",
  floor: "0.30",
  midpointRatio: new D(200).div(365),
  baseSteepness: "0.03",
};
