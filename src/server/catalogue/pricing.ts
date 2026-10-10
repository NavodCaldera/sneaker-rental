import "server-only";
import type Decimal from "decimal.js";
import { type D, toD } from "@/lib/decimal";
import {
  type CurveParams,
  type PricingSettings,
  catchUpPhi,
  curveParams,
  curvePoints,
  lifetimeCollected,
  priceAt,
  remainingValue,
  shownPrice,
  splitCharge,
} from "@/lib/pricing";
import { lifeLeft, wearRemaining } from "@/lib/wear-ledger";
import { type SettingsRow, toPricingSettings } from "../settings";

type Num = { toString(): string };

/** What pricing needs from a stored shoe: its inputs, state and settings snapshot. */
export type PricedShoe = {
  value: Num;
  lifespanDays: number;
  wear: Num;
  initialWear: Num;
  collectedSoFar: Num;
  settings: SettingsRow;
};

/**
 * A shoe's curve, built from the settings version it was listed under (pricing-spec.md
 * "Inputs"), plus what it has collected over its whole life including F(w₀).
 */
export function shoeCurve(shoe: PricedShoe): {
  params: CurveParams;
  settings: PricingSettings;
  collected: D;
} {
  const settings = toPricingSettings(shoe.settings);
  const params = curveParams(toD(shoe.value), shoe.lifespanDays, settings);
  const collected = lifetimeCollected(params, toD(shoe.initialWear), toD(shoe.collectedSoFar));
  return { params, settings, collected };
}

/** φ for the next rental of this shoe: catch-up factor if its settings turn it on, else 1. */
export function nextPhi(shoe: PricedShoe): D {
  const { params, settings, collected } = shoeCurve(shoe);
  return settings.catchUp ? catchUpPhi(params, collected, toD(shoe.wear)) : toD(1);
}

/**
 * View models for prices shown in the catalogue. Every number comes from the pricing
 * engine; this file only shapes it. Values are unrounded Decimal strings; the UI rounds
 * for display.
 */
export type ShoePricing = {
  priceToday: string;
  priceNew: string;
  priceEnd: string;
  lifetimeIncome: string;
  remainingValue: string;
  wearRemaining: string;
  lifeLeft: string;
};

export function shoePricing(shoe: PricedShoe): ShoePricing {
  const { params: p, settings, collected } = shoeCurve(shoe);
  const wear = toD(shoe.wear);
  return {
    priceToday: shownPrice(p, wear, 0, nextPhi(shoe)).toString(),
    priceNew: p.K.toString(),
    priceEnd: priceAt(p, p.L).toString(),
    lifetimeIncome: p.R.toString(),
    remainingValue: remainingValue(p, wear, collected, settings).toString(),
    wearRemaining: wearRemaining(wear, p.L).toString(),
    lifeLeft: lifeLeft(wear, p.L).toString(),
  };
}

export type CurvePreview = {
  priceNew: string;
  priceEnd: string;
  lifetimeIncome: string;
  merchantShare: string;
  platformShare: string;
  points: { wear: string; price: string }[];
};

/** The price curve a merchant sees before publishing (§5.1). */
export function curvePreview(
  value: Decimal.Value,
  lifespanDays: Decimal.Value,
  settings: PricingSettings,
): CurvePreview {
  const p = curveParams(value, lifespanDays, settings);
  const shares = splitCharge(settings, p.R);
  return {
    priceNew: p.K.toString(),
    priceEnd: priceAt(p, p.L).toString(),
    lifetimeIncome: p.R.toString(),
    merchantShare: shares.merchant.toString(),
    platformShare: shares.platform.toString(),
    points: curvePoints(p, 61).map((pt) => ({
      wear: pt.wear.toString(),
      price: pt.price.toString(),
    })),
  };
}

/** The curve of a stored shoe, with its own settings snapshot. */
export function shoeCurvePreview(shoe: PricedShoe): CurvePreview {
  return curvePreview(toD(shoe.value), shoe.lifespanDays, toPricingSettings(shoe.settings));
}
