import type Decimal from "decimal.js";
import { D } from "../decimal";

/**
 * Pricing settings, passed in by the caller. The engine never reads config itself.
 * Mirrors the PricingSettings entity (business-model.md §8, pricing-spec.md "Inputs").
 * A shoe is priced with the settings version it was listed under.
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
  /** Steepness at the reference lifespan; scaled by refLife / L */
  baseSteepness: Decimal.Value;
  /** Lifespan the base curve was tuned for (365) */
  refLife: number;
  /** Shortest and longest lifespan a merchant may declare, in wear-days (6–24 months).
   *  An admin can grant a merchant a longer maximum on request. */
  minLife: number;
  maxLife: number;
  /** Highest discount a borrower can get (release discount cap): 0.10 */
  maxDiscount: Decimal.Value;
  /** Days before a holder's planned last day that the pair is shown, discounted, to the next borrower: 10 */
  releaseLeadDays: number;
  /** Release discount added per day from the start of that window: 0.005 */
  releaseDiscountStep: Decimal.Value;
  /** Option B: spread past discounts over the remaining life (OPEN DECISION; off at launch) */
  catchUp: boolean;
  /**
   * After a pair reaches its lifespan L, keep counting wear and charge the end-of-life price
   * P(L) = K · q for every further wear-day, even past the target R (product decision
   * 2026-10-11). Off = the reference engine: wear and rent stop at L.
   */
  chargePastLife: boolean;
  /** r: yearly return on money tied up in a shoe (idle-cost test only) */
  capitalRate: Decimal.Value;
  /** h: storage / logistics cost per idle day, LKR (idle-cost test only) */
  holdCostPerDay: Decimal.Value;
}

/** Launch defaults (CLAUDE.md "Launch defaults"). */
export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  merchantMargin: "0.10",
  platformMargin: "0.10",
  floor: "0.30",
  midpointRatio: new D(200).div(365),
  baseSteepness: "0.03",
  refLife: 365,
  minLife: 183, // 6 months
  maxLife: 730, // 24 months
  maxDiscount: "0.10",
  releaseLeadDays: 10,
  releaseDiscountStep: "0.005",
  catchUp: false,
  chargePastLife: true,
  capitalRate: "0.12",
  holdCostPerDay: "0",
};
