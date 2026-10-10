import { describe, expect, it } from "vitest";
import { D, roundMoney } from "./decimal";

describe("decimal", () => {
  it("keeps exact decimal arithmetic", () => {
    expect(new D("0.1").plus("0.2").toString()).toBe("0.3");
  });

  it("splits a rental charge without float drift", () => {
    const charge = new D("2866.1142780659993");
    const merchant = charge.times("1.10").div("1.20");
    const platform = charge.times("0.10").div("1.20");
    expect(merchant.plus(platform).minus(charge).abs().lt("1e-30")).toBe(true);
    expect(roundMoney(merchant).toFixed(2)).toBe("2627.27");
    expect(roundMoney(platform).toFixed(2)).toBe("238.84");
  });

  it("rounds half up to 2 dp", () => {
    expect(roundMoney("1.005").toFixed(2)).toBe("1.01");
    expect(roundMoney("2.004999").toFixed(2)).toBe("2.00");
  });
});
