/**
 * Acceptance tests from business-model.md §9 (Rental Pricing Formula Guide v2, μm + μp = 0.20).
 * 4-dp values: tolerance 1e-4. 2-dp charged amounts: exact after roundMoney.
 */
import { describe, expect, it } from "vitest";
import type Decimal from "decimal.js";
import { D } from "../../decimal";
import {
  DEFAULT_PRICING_SETTINGS as S,
  catchUpPhi,
  curveParams,
  incomeBetween,
  priceAt,
  roundMoney,
  splitCharge,
} from "..";

function near(actual: Decimal, expected: Decimal.Value, tol: Decimal.Value = "1e-4") {
  const diff = actual.minus(expected).abs();
  expect(diff.lte(tol), `${actual.toFixed(8)} ≠ ${expected} (±${tol})`).toBe(true);
}

const shoe = curveParams(6000, 365, S);

describe("§9 acceptance", () => {
  it.todo("90-day test problem, five shoes A–E → invoice 3,030.2730 (needs inputs from docs/)");
  it.todo(
    "Hard test problem, 10 users, 4 shoes, 800 days → each shoe collects R, total 33,600.00 (needs inputs from docs/)",
  );

  it("6,000 LKR shoe, L = 365: price 28.9248 new, 8.6774 at end of life", () => {
    near(priceAt(shoe, 0), "28.9248");
    near(priceAt(shoe, 365), "8.6774");
  });

  it("User 1, wear 0 → 100, 10% off: income 2,579.5029, discount cost 286.6114", () => {
    const { income, discountCost } = incomeBetween(shoe, 0, 100, "0.10");
    near(income, "2579.5029");
    near(discountCost, "286.6114");
  });

  it("Catch-up at wear 100: φ = 1.066133, User 2 starts at 29.8580 (28.0059 without)", () => {
    const collected = incomeBetween(shoe, 0, 100, "0.10").income;
    const phi = catchUpPhi(shoe, collected, 100);
    near(phi, "1.066133", "1e-6");
    near(phi.times(priceAt(shoe, 100)), "29.8580");
    near(priceAt(shoe, 100), "28.0059");
  });

  it("Three users (0→60, 60→160, 160→365), each 10% off, φ = 1: lifetime 6,480.0000", () => {
    const lifetime = [
      [0, 60],
      [60, 160],
      [160, 365],
    ].reduce((sum, [a, b]) => sum.plus(incomeBetween(shoe, a, b, "0.10").income), new D(0));
    near(lifetime, "6480.0000");
  });

  it("Split of a 2,866.11 rental: merchant 2,627.27, platform 238.84", () => {
    const { merchant, platform } = splitCharge(S, "2866.11");
    expect(roundMoney(merchant).toFixed(2)).toBe("2627.27");
    expect(roundMoney(platform).toFixed(2)).toBe("238.84");
  });

  it("100-wear-day rental of a new shoe charges 2,866.11 (§4 example)", () => {
    const { income } = incomeBetween(shoe, 0, 100);
    expect(roundMoney(income).toFixed(2)).toBe("2866.11");
    const { merchant, platform } = splitCharge(S, income);
    expect(roundMoney(merchant).toFixed(2)).toBe("2627.27");
    expect(roundMoney(platform).toFixed(2)).toBe("238.84");
  });

  it("Same shoe declared L = 730: curve area 497.8428, new price half of L = 365", () => {
    const long = curveParams(6000, 730, S);
    // Brief: 497.8428; closed form gives 497.84271. Tolerance 1e-3 per pricing-spec.md.
    near(long.A, "497.8428", "1e-3");
    near(priceAt(long, 0).times(2), priceAt(shoe, 0), "1e-9");
  });
});
