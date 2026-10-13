import { describe, expect, it } from "vitest";
import { D } from "../../decimal";
import { DEFAULT_PRICING_SETTINGS as S, curveParams, incomeBetween } from "..";

describe("free wear: the birthday month (pricing-spec.md §8a)", () => {
  const p = curveParams(new D(6000), 365, S);

  it("waives the discounted rent of free wear inside the item, and nothing else", () => {
    const whole = incomeBetween(p, 0, 100, "0.05");
    const part = incomeBetween(p, 30, 58).undiscounted;
    const r = incomeBetween(p, 0, 100, "0.05", 1, [[30, 58]]);
    expect(r.undiscounted.toString()).toBe(whole.undiscounted.toString());
    expect(r.discountCost.toString()).toBe(whole.discountCost.toString());
    expect(r.freeCost.toString()).toBe(part.times("0.95").toString());
    expect(r.income.toString()).toBe(whole.income.minus(r.freeCost).toString());
  });

  it("clips free wear to the item and skips intervals outside it", () => {
    expect(incomeBetween(p, 10, 20, 0, 1, [[25, 30]]).freeCost.toString()).toBe("0");
    expect(incomeBetween(p, 10, 20, 0, 1, [[5, 15]]).freeCost.toString()).toBe(
      incomeBetween(p, 10, 15).undiscounted.toString(),
    );
    // The whole item free: nothing to pay.
    expect(incomeBetween(p, 10, 20, 0, 1, [[0, 50]]).income.toString()).toBe("0");
    expect(incomeBetween(p, 10, 20).freeCost.toString()).toBe("0");
  });
});
