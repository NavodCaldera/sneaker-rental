import "server-only";
import type Decimal from "decimal.js";
import { toD } from "@/lib/decimal";
import {
  type PricingSettings,
  curveParams,
  curvePoints,
  priceAt,
  remainingValue,
  splitCharge,
} from "@/lib/pricing";

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
};

export function shoePricing(
  shoe: { value: { toString(): string }; lifespanDays: number; wear: { toString(): string } },
  settings: PricingSettings,
): ShoePricing {
  const p = curveParams(toD(shoe.value), shoe.lifespanDays, settings);
  const wear = toD(shoe.wear);
  return {
    priceToday: priceAt(p, wear).toString(),
    priceNew: p.K.toString(),
    priceEnd: priceAt(p, p.L).toString(),
    lifetimeIncome: p.R.toString(),
    remainingValue: remainingValue(p, wear).toString(),
    wearRemaining: p.L.minus(wear).toString(),
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
