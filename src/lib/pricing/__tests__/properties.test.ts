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
  incomeBetween,
  lifetimeCollected,
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

  it("remainingValue(w) + F(w) = R, and R − collected with catch-up", () => {
    const w = L / 3;
    const collected = curveIncome(p, w);
    expect(remainingValue(p, w, 0, S).plus(collected).minus(p.R).abs().lt(EPS)).toBe(true);
    expect(remainingValue(p, L, 0, S).abs().lt("1e-25")).toBe(true);
    const lessCollected = collected.times("0.9");
    expect(
      remainingValue(p, w, lessCollected, { catchUp: true }).eq(p.R.minus(lessCollected)),
    ).toBe(true);
    expect(remainingValue(p, w, p.R.plus(1), { catchUp: true }).eq(0)).toBe(true);
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

  it("exact split shares always sum to the amount", () => {
    for (const amount of ["0", "0.01", "2866.1142780659993", "123456.789"]) {
      const { merchant, platform } = splitCharge(S, amount);
      expect(merchant.plus(platform).eq(amount)).toBe(true);
    }
  });

  it("catch-up φ is 1 with nothing collected short of the curve, 1 at end of life, never negative", () => {
    const collected = curveIncome(p, 100);
    expect(catchUpPhi(p, collected, 100).minus(1).abs().lt(EPS)).toBe(true);
    expect(catchUpPhi(p, p.R, 365).eq(1)).toBe(true);
    expect(catchUpPhi(p, p.R.times(2), 100).eq(0)).toBe(true);
  });

  it("a second-hand shoe has collected F(w₀) before its first rental, so φ starts at 1", () => {
    const collected = lifetimeCollected(p, 120, 0);
    expect(collected.eq(curveIncome(p, 120))).toBe(true);
    expect(catchUpPhi(p, collected, 120).minus(1).abs().lt(EPS)).toBe(true);
  });

  it("bundle daily cost of four identical new pairs equals one pair's price", () => {
    const price = priceAt(p, 0);
    expect(bundleDailyCost([price, price, price, price]).eq(price)).toBe(true);
    expect(bundleDailyCost([]).eq(0)).toBe(true);
  });

  it("rejects invalid input", () => {
    expect(() => curveParams(0, 365, S)).toThrow(RangeError);
    expect(() => curveParams(6000, 0, S)).toThrow(RangeError);
    expect(() => curveParams(6000, 59, S)).toThrow(RangeError);
    expect(() => incomeBetween(p, 0, 10, 1)).toThrow(RangeError);
    expect(() => incomeBetween(p, 0, 10, -0.1)).toThrow(RangeError);
    expect(() => incomeBetween(p, 10, 5)).toThrow(RangeError);
    expect(() => Q(p, -1)).toThrow(RangeError);
    expect(() => IQ(p, -1)).toThrow(RangeError);
    expect(() => curvePoints(p, 1)).toThrow(RangeError);
  });
});

describe("chargedAmounts", () => {
  it("rounds the charge and the platform share; the merchant gets the remainder", async () => {
    const { chargedAmounts } = await import("..");
    const r = chargedAmounts(S, "2866.1142780659993");
    expect(r.charge.toFixed(2)).toBe("2866.11");
    expect(r.merchantShare.toFixed(2)).toBe("2627.27");
    expect(r.platformShare.toFixed(2)).toBe("238.84");
    expect(r.discountGiven.eq(0)).toBe(true);
    // 0.06 → platform 0.005 rounds to 0.01; merchant gets the remaining 0.05.
    const tiny = chargedAmounts(S, "0.06");
    expect(tiny.platformShare.toFixed(2)).toBe("0.01");
    expect(tiny.merchantShare.toFixed(2)).toBe("0.05");
    for (const x of ["0.05", "10.015", "333.335", "1.005"]) {
      const a = chargedAmounts(S, x);
      expect(a.merchantShare.plus(a.platformShare).eq(a.charge)).toBe(true);
    }
  });

  it("merchant-funded discount comes out of the merchant share only", async () => {
    const { chargedAmounts } = await import("..");
    const p = curveParams(6000, 365, S);
    const { income, undiscounted } = incomeBetween(p, 0, 100, "0.05");
    const promo = chargedAmounts(S, income, { undiscounted, fundedBy: "platform" });
    const idle = chargedAmounts(S, income, { undiscounted, fundedBy: "merchant" });
    const full = chargedAmounts(S, undiscounted);
    expect(idle.charge.eq(promo.charge)).toBe(true);
    expect(idle.platformShare.eq(full.platformShare)).toBe(true);
    expect(idle.merchantShare.plus(idle.platformShare).eq(idle.charge)).toBe(true);
    expect(promo.platformShare.lt(full.platformShare)).toBe(true);
    expect(idle.discountGiven.eq(full.charge.minus(idle.charge))).toBe(true);
  });
});
