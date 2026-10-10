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
  /** OPEN DECISION: shortest and longest lifespan a merchant may declare, in wear-days */
  minLife: number;
  maxLife: number;
  /** Highest idle discount (Phase 2 ladder) */
  idleDiscountCap: Decimal.Value;
  /** Option B: spread past discounts over the remaining life (OPEN DECISION; off at launch) */
  catchUp: boolean;
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
  minLife: 60,
  maxLife: 1095,
  idleDiscountCap: "0.05",
  catchUp: false,
  capitalRate: "0.12",
  holdCostPerDay: "0",
};
