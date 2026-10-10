import { describe, expect, it } from "vitest";
import { MockGateway, toMinorUnits } from "./gateway";

describe("payment gateway adapter", () => {
  it("converts LKR to minor units exactly", () => {
    expect(toMinorUnits("2866.11")).toBe("286611");
    expect(toMinorUnits("0.10")).toBe("10");
    expect(toMinorUnits("5000")).toBe("500000");
  });

  it("mock replays results for a repeated idempotency key", async () => {
    const g = new MockGateway();
    const a = await g.preAuthorise("100.00", "k1");
    const b = await g.preAuthorise("100.00", "k1");
    const c = await g.preAuthorise("100.00", "k2");
    expect(a).toEqual(b);
    expect(c).not.toEqual(a);
  });

  it("mock declines 13.13 LKR", async () => {
    expect((await new MockGateway().capture("ref", "13.13", "k")).ok).toBe(false);
  });
});
