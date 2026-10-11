import "server-only";
import type Decimal from "decimal.js";
import { type D, toD } from "@/lib/decimal";
import {
  type CurveParams,
  type PricingMethod,
  type PricingSettings,
  catchUpPhi,
  curveParams,
  curvePoints,
  lifetimeCollected,
  merchantOutstanding,
  merchantTarget,
  priceAt,
  releaseDiscount,
  remainingValue,
  shownPrice,
  splitCharge,
} from "@/lib/pricing";
import { type Day, dateToDay, lifeLeft, wearRemaining } from "@/lib/wear-ledger";
import type { Tx } from "../db";
import { type SettingsRow, toPricingSettings } from "../settings";

type Num = { toString(): string };

/** What pricing needs from a stored shoe: its inputs, state and settings snapshot. */
export type PricedShoe = {
  value: Num;
  lifespanDays: number;
  wear: Num;
  /** Settled wear plus open bookings' planned wear; the next rental starts here */
  committedWear?: Num;
  initialWear: Num;
  collectedSoFar: Num;
  merchantCollected: Num;
  /** The price curve the merchant picked (S-curve or exponential decay) */
  pricingMethod: PricingMethod;
  settings: SettingsRow;
};

/**
 * A shoe's curve, built from the settings version it was listed under (pricing-spec.md
 * "Inputs") and the pricing method its merchant picked, plus what it has collected over its
 * whole life including F(w₀).
 */
export function shoeCurve(shoe: PricedShoe): {
  params: CurveParams;
  settings: PricingSettings;
  collected: D;
} {
  const settings = toPricingSettings(shoe.settings);
  const params = curveParams(toD(shoe.value), shoe.lifespanDays, settings, shoe.pricingMethod);
  const collected = lifetimeCollected(params, toD(shoe.initialWear), toD(shoe.collectedSoFar));
  return { params, settings, collected };
}

/**
 * The wear the next rental of this shoe starts from: its committed wear (pricing-spec.md
 * §6a), so a pair booked for 90 days is priced for the next borrower at wear + 90.
 */
export function nextWear(shoe: PricedShoe): D {
  return toD(shoe.committedWear ?? shoe.wear);
}

/** φ for the next rental of this shoe: catch-up factor if its settings turn it on, else 1. */
export function nextPhi(shoe: PricedShoe): D {
  const { params, settings, collected } = shoeCurve(shoe);
  return settings.catchUp ? catchUpPhi(params, collected, nextWear(shoe)) : toD(1);
}

/**
 * Merchant first (pricing-spec.md §7): the merchant's target over the shoe's life and what
 * they are still owed. `merchantFundedDiscounts` lowers the target (idle discounts).
 */
export function merchantOwed(
  shoe: PricedShoe,
  merchantFundedDiscounts: Decimal.Value = 0,
): { target: D; outstanding: D } {
  const { params, settings } = shoeCurve(shoe);
  const target = merchantTarget(params, toD(shoe.initialWear), settings, merchantFundedDiscounts);
  return { target, outstanding: merchantOutstanding(target, toD(shoe.merchantCollected)) };
}

/** Cost of merchant-funded discounts on a shoe's closed rentals (they lower its target). */
export async function merchantFundedDiscounts(tx: Tx, shoeId: string): Promise<D> {
  const { _sum } = await tx.rentalItem.aggregate({
    where: { shoeId, status: { in: ["CLOSED", "LOST"] }, discountFunding: "MERCHANT" },
    _sum: { discountCost: true },
  });
  return toD(_sum.discountCost ?? 0);
}

/**
 * Release discount for the next borrower of a pair (pricing-spec.md §8), from the active
 * settings: it grows from `releaseLeadDays` before the current or last holder's planned
 * last day, up to `maxDiscount`. A held pair can be reserved at any time; booking before the
 * window just gets no discount.
 */
export function releaseInfo(
  shoe: { releaseDay: Date | null },
  active: SettingsRow,
  today: Day,
): { discount: D; releaseDay: Day | null } {
  const settings = toPricingSettings(active);
  const releaseDay = shoe.releaseDay ? dateToDay(shoe.releaseDay) : null;
  return { discount: releaseDiscount(today, releaseDay, settings), releaseDay };
}

/**
 * View models for prices shown in the catalogue. Every number comes from the pricing
 * engine; this file only shapes it. Values are unrounded Decimal strings; the UI rounds
 * for display.
 */
export type ShoePricing = {
  /** Price per wear-day a borrower booking today pays, after any release discount */
  priceToday: string;
  /** Curve price before the release discount */
  priceBeforeDiscount: string;
  discount: string;
  priceNew: string;
  priceEnd: string;
  lifetimeIncome: string;
  remainingValue: string;
  wearRemaining: string;
  lifeLeft: string;
  merchantTarget: string;
  merchantCollected: string;
};

export function shoePricing(shoe: PricedShoe, discount: Decimal.Value = 0): ShoePricing {
  const { params: p, settings, collected } = shoeCurve(shoe);
  const wear = nextWear(shoe);
  const phi = nextPhi(shoe);
  return {
    priceToday: shownPrice(p, wear, discount, phi).toString(),
    priceBeforeDiscount: shownPrice(p, wear, 0, phi).toString(),
    discount: toD(discount).toString(),
    priceNew: p.K.toString(),
    priceEnd: priceAt(p, p.L).toString(),
    lifetimeIncome: p.R.toString(),
    remainingValue: remainingValue(p, wear, collected, settings).toString(),
    wearRemaining: wearRemaining(wear, p.L).toString(),
    lifeLeft: lifeLeft(wear, p.L).toString(),
    merchantTarget: merchantOwed(shoe).target.toString(),
    merchantCollected: shoe.merchantCollected.toString(),
  };
}

export type CurvePreview = {
  method: PricingMethod;
  priceNew: string;
  priceEnd: string;
  lifetimeIncome: string;
  merchantShare: string;
  platformShare: string;
  points: { wear: string; price: string }[];
};

/** The price curve a merchant sees before publishing (§5.1), for the method they pick. */
export function curvePreview(
  value: Decimal.Value,
  lifespanDays: Decimal.Value,
  settings: PricingSettings,
  method: PricingMethod = "LOGISTIC",
): CurvePreview {
  const p = curveParams(value, lifespanDays, settings, method);
  const shares = splitCharge(settings, p.R);
  return {
    method,
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

/** The curve of a stored shoe, with its own settings snapshot and pricing method. */
export function shoeCurvePreview(shoe: PricedShoe): CurvePreview {
  return curvePreview(
    toD(shoe.value),
    shoe.lifespanDays,
    toPricingSettings(shoe.settings),
    shoe.pricingMethod,
  );
}
