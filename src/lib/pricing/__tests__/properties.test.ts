import { describe, expect, it } from "vitest";
import { D } from "../../decimal";
import {
  DEFAULT_PRICING_SETTINGS as S,
  IQ,
  Q,
  bundleDailyCost,
  catchUpPhi,
  curveIncome,
  curveParams,
  curvePoints,
  estimateItem,
  incomeBetween,
  priceAt,
  remainingValue,
  splitCharge,
  targetIncome,
} from "..";

const EPS = "1e-20";
const shapes = [
  [6000, 365],
  [6000, 730],
  [25000, 120],
  [3500, 1000],
] as const;

describe.each(shapes)("curve V = %d, L = %d", (V, L) => {
  const p = curveParams(V, L, S);

  it("Q(0) = 1 and Q(L) = q", () => {
    expect(Q(p, 0).minus(1).abs().lt(EPS)).toBe(true);
    expect(Q(p, L).minus("0.30").abs().lt(EPS)).toBe(true);
  });

  it("Q is non-increasing over [0, L]", () => {
    const points = curvePoints(p, 200);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].price.lte(points[i - 1].price)).toBe(true);
    }
  });

  it("IQ(L) = A and F(L) = R", () => {
    expect(IQ(p, L).eq(p.A)).toBe(true);
    expect(curveIncome(p, L).minus(p.R).abs().lt("1e-25")).toBe(true);
  });

  it("A ≈ 0.68198 · L for any L (shape is scale-invariant)", () => {
    expect(p.A.div(L).minus("0.68198").abs().lt("1e-5")).toBe(true);
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
    expect(remainingValue(p, w).plus(curveIncome(p, w)).minus(p.R).abs().lt(EPS)).toBe(true);
    expect(remainingValue(p, L).abs().lt("1e-25")).toBe(true);
  });
});

describe("charges", () => {
  const p = curveParams(6000, 365, S);

  it("R = (1 + μm + μp) · V", () => {
    expect(targetIncome(6000, S).eq(7200)).toBe(true);
  });

  it("clamps wear at L and stops earning past it", () => {
    expect(incomeBetween(p, 300, 500).income.eq(incomeBetween(p, 300, 365).income)).toBe(true);
    expect(priceAt(p, 366).eq(0)).toBe(true);
    expect(incomeBetween(p, 365, 400).income.eq(0)).toBe(true);
  });

  it("discounts never stack: the next item starts from the undiscounted curve", () => {
    incomeBetween(p, 0, 100, "0.10");
    const next = incomeBetween(p, 100, 150);
    expect(next.discountCost.eq(0)).toBe(true);
    expect(next.income.eq(p.K.times(IQ(p, 150).minus(IQ(p, 100))))).toBe(true);
  });

  it("split shares always sum to the charge", () => {
    for (const amount of ["0", "0.01", "2866.1142780659993", "123456.789"]) {
      const { merchant, platform } = splitCharge(S, amount);
      expect(merchant.plus(platform).eq(amount)).toBe(true);
    }
  });

  it("merchant-funded discount comes out of the merchant share only", () => {
    const { income, undiscounted } = incomeBetween(p, 0, 100, "0.05");
    const platformPromo = splitCharge(S, income, { undiscounted, fundedBy: "platform" });
    const merchantIdle = splitCharge(S, income, { undiscounted, fundedBy: "merchant" });
    const fullPlatform = splitCharge(S, undiscounted).platform;
    expect(merchantIdle.platform.eq(fullPlatform)).toBe(true);
    expect(merchantIdle.merchant.plus(merchantIdle.platform).eq(income)).toBe(true);
    expect(platformPromo.platform.lt(fullPlatform)).toBe(true);
  });

  it("catch-up φ is 1 with nothing collected short of the curve, and 1 at end of life", () => {
    const collected = curveIncome(p, 100);
    expect(catchUpPhi(p, collected, 100).minus(1).abs().lt(EPS)).toBe(true);
    expect(catchUpPhi(p, p.R, 365).eq(1)).toBe(true);
  });

  it("estimate splits wear across the bundle: 4 pairs × 10 days = 2.5 wear-days each", () => {
    const one = estimateItem(p, 0, 10, 1);
    const four = estimateItem(p, 0, 10, 4);
    expect(one.wearAdded.eq(10)).toBe(true);
    expect(four.wearAdded.eq("2.5")).toBe(true);
    expect(four.charge.lt(one.charge)).toBe(true);
    expect(estimateItem(p, 364, 10, 1).wearAdded.eq(1)).toBe(true);
  });

  it("bundle daily cost of four identical new pairs equals one pair's price", () => {
    const price = priceAt(p, 0);
    expect(bundleDailyCost([price, price, price, price]).eq(price)).toBe(true);
    expect(bundleDailyCost([]).eq(0)).toBe(true);
  });

  it("rejects invalid input", () => {
    expect(() => curveParams(0, 365, S)).toThrow(RangeError);
    expect(() => curveParams(6000, 0, S)).toThrow(RangeError);
    expect(() => incomeBetween(p, 0, 10, 1)).toThrow(RangeError);
    expect(() => incomeBetween(p, 0, 10, -0.1)).toThrow(RangeError);
    expect(() => incomeBetween(p, 10, 5)).toThrow(RangeError);
    expect(() => Q(p, -1)).toThrow(RangeError);
    expect(() => IQ(p, -1)).toThrow(RangeError);
    expect(() => estimateItem(p, 0, 10, 0)).toThrow(RangeError);
    expect(() => curvePoints(p, 1)).toThrow(RangeError);
  });
});
