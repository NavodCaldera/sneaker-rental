import { describe, expect, it } from "vitest";
import { D } from "../../decimal";
import {
  DEFAULT_PRICING_SETTINGS as S,
  IQ,
  PRICING_METHODS,
  Q,
  catchUpPhi,
  curveIncome,
  curveParams,
  curvePoints,
  incomeBetween,
  lifetimeCollected,
  merchantTarget,
  priceAt,
  remainingValue,
} from "..";

/**
 * Exponential decay (pricing-spec.md §2.2): Q(w) = q^(w/L) = e^(−λw), λ = ln(1/q) / L.
 * Same floor q, target R and past-life price P(L) = K · q as the S-curve; only the shape
 * (and so K = R / A) differs.
 */
const EPS = "1e-20";
const shapes = [
  [6000, 365],
  [6000, 730],
  [25000, 120],
  [3500, 1000],
] as const;

describe.each(shapes)("exponential curve V = %d, L = %d", (V, L) => {
  const p = curveParams(V, L, S, "EXPONENTIAL");

  it("Q(0) = 1, Q(L) = q, and Q(w) = q^(w/L) between", () => {
    expect(Q(p, 0).eq(1)).toBe(true);
    expect(Q(p, L).minus("0.30").abs().lt(EPS)).toBe(true);
    const w = new D(L).times("0.37");
    expect(
      Q(p, w)
        .minus(new D("0.30").pow(w.div(L)))
        .abs()
        .lt(EPS),
    ).toBe(true);
  });

  it("falls fastest when new: every step down is smaller than the one before", () => {
    const points = curvePoints(p, 100);
    let lastDrop: D | null = null;
    for (let i = 1; i < points.length; i++) {
      const drop = points[i - 1].price.minus(points[i].price);
      expect(drop.gt(0)).toBe(true);
      if (lastDrop) expect(drop.lt(lastDrop)).toBe(true);
      lastDrop = drop;
    }
  });

  it("IQ(L) = A = (1 − q) · L / ln(1/q) ≈ 0.581408 · L, and F(L) = R", () => {
    const exact = new D(1).minus("0.30").times(L).div(new D(1).div("0.30").ln());
    expect(p.A.minus(exact).abs().lt(EPS)).toBe(true);
    expect(p.A.div(L).minus("0.581408").abs().lt("1e-6")).toBe(true);
    expect(IQ(p, L).eq(p.A)).toBe(true);
    expect(curveIncome(p, L).minus(p.R).abs().lt("1e-25")).toBe(true);
  });

  it("IQ matches a fine numerical integral of Q", () => {
    const w = new D(L).times("0.6");
    const steps = 2000;
    const h = w.div(steps);
    let sum = new D(0);
    for (let i = 0; i < steps; i++) sum = sum.plus(Q(p, h.times(i + 0.5)));
    expect(sum.times(h).minus(IQ(p, w)).abs().div(IQ(p, w)).lt("1e-6")).toBe(true);
  });

  it("incomes over consecutive ranges add up to R", () => {
    const cuts = [0, L * 0.1, L * 0.37, L * 0.5, L * 0.81, L];
    let total = new D(0);
    for (let i = 1; i < cuts.length; i++) {
      total = total.plus(incomeBetween(p, cuts[i - 1], cuts[i]).income);
    }
    expect(total.minus(p.R).abs().lt("1e-25")).toBe(true);
  });

  it("remainingValue(w) + F(w) = R", () => {
    const w = L / 3;
    expect(remainingValue(p, w, 0, S).plus(curveIncome(p, w)).minus(p.R).abs().lt(EPS)).toBe(true);
  });
});

describe("exponential decay vs the S-curve", () => {
  const s = curveParams(6000, 365, S);
  const e = curveParams(6000, 365, S, "EXPONENTIAL");

  it("the S-curve is the default and keeps its numbers", () => {
    expect(s.method).toBe("LOGISTIC");
    expect(PRICING_METHODS).toEqual(["LOGISTIC", "EXPONENTIAL"]);
    expect(s.K.toFixed(4)).toBe("28.9248");
  });

  it("6,000 LKR, L = 365: A = 212.2141, K = 33.9280, P(L) = 10.1784", () => {
    expect(e.method).toBe("EXPONENTIAL");
    expect(e.A.toFixed(4)).toBe("212.2141");
    expect(e.K.toFixed(4)).toBe("33.9280");
    expect(priceAt(e, 365).toFixed(4)).toBe("10.1784");
    expect(priceAt(e, 365).eq(e.K.times(e.q))).toBe(true);
  });

  it("same target R and floor ratio; dearer new, cheaper in mid-life, dearer when worn", () => {
    expect(e.R.eq(s.R)).toBe(true);
    expect(priceAt(e, 365).div(e.K).minus(priceAt(s, 365).div(s.K)).abs().lt(EPS)).toBe(true);
    expect(e.K.gt(s.K)).toBe(true);
    expect(priceAt(e, 91.25).lt(priceAt(s, 91.25))).toBe(true);
    expect(priceAt(e, 182.5).lt(priceAt(s, 182.5))).toBe(true);
    expect(priceAt(e, 273.75).gt(priceAt(s, 273.75))).toBe(true);
    expect(priceAt(e, 365).gt(priceAt(s, 365))).toBe(true);
    // The S-curve holds its price early, so it collects more of R in the first half of life.
    expect(curveIncome(e, 182.5).lt(curveIncome(s, 182.5))).toBe(true);
  });

  it("past L each wear-day costs P(L) = K · q", () => {
    const end = priceAt(e, 365);
    expect(priceAt(e, 400).eq(end)).toBe(true);
    expect(incomeBetween(e, 365, 385).income.minus(end.times(20)).abs().lt(EPS)).toBe(true);
    const ref = curveParams(6000, 365, { ...S, chargePastLife: false }, "EXPONENTIAL");
    expect(priceAt(ref, 366).eq(0)).toBe(true);
  });

  it("a second-hand pair's merchant target and φ use its own curve", () => {
    const collected = lifetimeCollected(e, 120, 0);
    expect(catchUpPhi(e, collected, 120).minus(1).abs().lt(EPS)).toBe(true);
    const target = merchantTarget(e, 120, S);
    const expected = new D("1.10").times(6000).times(new D(1).minus(IQ(e, 120).div(e.A)));
    expect(target.minus(expected).abs().lt(EPS)).toBe(true);
    expect(target.eq(merchantTarget(s, 120, S))).toBe(false);
  });

  it("needs a floor strictly between 0 and 1", () => {
    expect(() => curveParams(6000, 365, { ...S, floor: 0 }, "EXPONENTIAL")).toThrow(RangeError);
    expect(() => curveParams(6000, 365, { ...S, floor: 1 }, "EXPONENTIAL")).toThrow(RangeError);
    expect(() => curveParams(6000, 365, S, "LINEAR" as unknown as "LOGISTIC")).toThrow(RangeError);
  });
});
