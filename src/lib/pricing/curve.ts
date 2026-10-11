import type Decimal from "decimal.js";
import { D } from "../decimal";
import type { PricingSettings } from "./settings";

/**
 * Wear-based price curve for one shoe (docs/pricing-spec.md "Curve").
 * All values are unrounded Decimals.
 */
export interface CurveParams {
  V: D;
  L: D;
  /** Target lifetime income R = (1 + μm + μp) · V */
  R: D;
  /** Midpoint m = midpointRatio · L */
  m: D;
  /** Steepness β = baseSteepness · refLife / L */
  beta: D;
  /** Floor q */
  q: D;
  /** Curve area A = IQ(L) */
  A: D;
  /** Price per wear-day when new, K = R / A */
  K: D;
  /** Wear past L is charged at P(L) (settings.chargePastLife); otherwise it earns nothing */
  pastLife: boolean;
  // Precomputed normalisation terms
  readonly S0: D;
  readonly SL: D;
  readonly IS0: D;
}

const ONE = new D(1);

/** ln(1 + e^x), computed without overflow. */
function softplus(x: D): D {
  return x.gt(0) ? x.plus(ONE.plus(x.neg().exp()).ln()) : ONE.plus(x.exp()).ln();
}

/** Logistic S(w) = 1 / (1 + e^(β(w − m))) */
function logistic(w: D, m: D, beta: D): D {
  return ONE.div(ONE.plus(beta.times(w.minus(m)).exp()));
}

/** Antiderivative of S: IS(w) = w − (1/β) · ln(1 + e^(β(w − m))) */
function logisticIntegral(w: D, m: D, beta: D): D {
  return w.minus(softplus(beta.times(w.minus(m))).div(beta));
}

export function targetIncome(V: Decimal.Value, settings: PricingSettings): D {
  return ONE.plus(settings.merchantMargin).plus(settings.platformMargin).times(V);
}

/**
 * A new listing's value must be positive and its lifespan within the limits that apply to
 * the merchant (settings, or a longer maximum an admin granted). Checked when a shoe is
 * listed, not when it is priced, so an extended shoe keeps its curve.
 */
export function validateListing(
  V: Decimal.Value,
  L: Decimal.Value,
  settings: Pick<PricingSettings, "minLife" | "maxLife">,
): void {
  if (!new D(V).gt(0)) throw new RangeError("Declared value must be greater than 0");
  const l = new D(L);
  if (l.lt(settings.minLife) || l.gt(settings.maxLife)) {
    throw new RangeError(
      `Lifespan must be between ${settings.minLife} and ${settings.maxLife} wear-days`,
    );
  }
}

export function curveParams(
  V: Decimal.Value,
  L: Decimal.Value,
  settings: PricingSettings,
): CurveParams {
  const v = new D(V);
  const l = new D(L);
  if (!v.gt(0)) throw new RangeError("Declared value must be greater than 0");
  if (!l.gt(0)) throw new RangeError("Lifespan must be greater than 0");

  const q = new D(settings.floor);
  const m = new D(settings.midpointRatio).times(l);
  const beta = new D(settings.baseSteepness).times(settings.refLife).div(l);
  const S0 = logistic(new D(0), m, beta);
  const SL = logistic(l, m, beta);
  const IS0 = logisticIntegral(new D(0), m, beta);
  const R = targetIncome(v, settings);

  const partial = { V: v, L: l, R, m, beta, q, S0, SL, IS0 };
  const A = integralAt(partial, l);
  return { ...partial, A, K: R.div(A), pastLife: settings.chargePastLife };
}

type CurveShape = Pick<CurveParams, "L" | "m" | "beta" | "q" | "S0" | "SL" | "IS0">;

function clampWear(p: Pick<CurveParams, "L">, w: Decimal.Value): D {
  const x = new D(w);
  if (x.lt(0)) throw new RangeError("Wear cannot be negative");
  return D.min(x, p.L);
}

function integralAt(p: CurveShape, w: Decimal.Value): D {
  const x = clampWear(p, w);
  const span = p.S0.minus(p.SL);
  const logisticPart = logisticIntegral(x, p.m, p.beta).minus(p.IS0).minus(p.SL.times(x));
  return p.q.times(x).plus(ONE.minus(p.q).times(logisticPart).div(span));
}

/**
 * Normalised curve Q(w) = q + (1 − q) · (S(w) − S(L)) / (S(0) − S(L)).
 * Q(0) = 1, Q(L) = q. Beyond L it stays at q when wear past the lifespan is charged
 * (`pastLife`), and is 0 otherwise (the reference engine: the shoe stops earning).
 */
export function Q(p: CurveParams, w: Decimal.Value): D {
  const x = new D(w);
  if (x.lt(0)) throw new RangeError("Wear cannot be negative");
  if (x.gt(p.L)) return p.pastLife ? p.q : new D(0);
  const s = logistic(x, p.m, p.beta);
  return p.q.plus(ONE.minus(p.q).times(s.minus(p.SL)).div(p.S0.minus(p.SL)));
}

/** IQ(w) = ∫₀ʷ Q, with w clamped to L. A = IQ(L). */
export function IQ(p: CurveParams, w: Decimal.Value): D {
  return integralAt(p, w);
}

/**
 * The integral rent is charged on: IQ(w), plus q · (w − L) for wear past L when it is
 * charged (`pastLife`). Rent for w0 → w1 is (1 − d) · φ · K · [rentIntegral(w1) −
 * rentIntegral(w0)], so every wear-day past L costs P(L) = K · q. Equal to IQ up to L.
 */
export function rentIntegral(p: CurveParams, w: Decimal.Value): D {
  const x = new D(w);
  const past = p.pastLife && x.gt(p.L) ? p.q.times(x.minus(p.L)) : new D(0);
  return IQ(p, x).plus(past);
}

/** Price per wear-day at wear w: P(w) = K · Q(w). */
export function priceAt(p: CurveParams, w: Decimal.Value): D {
  return p.K.times(Q(p, w));
}

/**
 * Price per wear-day a borrower sees: (1 − d) · φ · P(w), always from the curve at the
 * shoe's current wear, so discounts never stack.
 */
export function shownPrice(
  p: CurveParams,
  w: Decimal.Value,
  discount: Decimal.Value = 0,
  phi: Decimal.Value = 1,
): D {
  return ONE.minus(discount).times(phi).times(priceAt(p, w));
}

/** Curve income from new to wear w: F(w) = K · IQ(w) (undiscounted, φ = 1). */
export function curveIncome(p: CurveParams, w: Decimal.Value): D {
  return p.K.times(IQ(p, w));
}

/** Sample the curve for a preview chart: `points` evenly spaced wear values from 0 to L. */
export function curvePoints(p: CurveParams, points = 53): { wear: D; price: D }[] {
  if (points < 2) throw new RangeError("Need at least 2 points");
  return Array.from({ length: points }, (_, i) => {
    const wear = p.L.times(i).div(points - 1);
    return { wear, price: priceAt(p, wear) };
  });
}
