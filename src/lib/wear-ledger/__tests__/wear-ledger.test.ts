import { describe, expect, it } from "vitest";
import { D } from "../../decimal";
import { type Holding, colomboDay, wearAdded, wearEnd } from "..";

const h = (itemId: string, start: number, end: number | null): Holding => ({ itemId, start, end });

describe("wear ledger", () => {
  it("one pair held 10 days adds 10 wear-days", () => {
    expect(wearAdded([h("a", 0, 10)], "a").eq(10)).toBe(true);
  });

  it("four pairs held together for 10 days add 2.5 wear-days each", () => {
    const holdings = ["a", "b", "c", "d"].map((id) => h(id, 0, 10));
    for (const id of ["a", "b", "c", "d"]) expect(wearAdded(holdings, id).eq("2.5")).toBe(true);
  });

  it("overlapping items with different dates split only the shared days", () => {
    // a: days 0–9; b: days 4–13. Shared days 4–9 (6 days).
    const holdings = [h("a", 0, 10), h("b", 4, 14)];
    expect(wearAdded(holdings, "a").eq(4 + 6 / 2)).toBe(true); // 7
    expect(wearAdded(holdings, "b").eq(6 / 2 + 4)).toBe(true); // 7
  });

  it("total wear per day across the bundle is always one wear-day", () => {
    const holdings = [h("a", 0, 7), h("b", 2, 12), h("c", 5, 9)];
    const total = holdings.reduce((sum, x) => sum.plus(wearAdded(holdings, x.itemId)), new D(0));
    expect(total.eq(12)).toBe(true); // days 0–11 inclusive, one wear-day each
  });

  it("other open items count as held when an item closes", () => {
    const holdings = [h("a", 0, 6), h("b", 0, null)];
    expect(wearAdded(holdings, "a").eq(3)).toBe(true);
    // b, still open, evaluated through day 10: days 0–5 shared, 6–9 alone.
    expect(wearAdded(holdings, "b", 10).eq(3 + 4)).toBe(true);
  });

  it("ignores holdings that don't overlap", () => {
    const holdings = [h("a", 10, 20), h("old", 0, 10), h("later", 20, 30)];
    expect(wearAdded(holdings, "a").eq(10)).toBe(true);
  });

  it("a same-day return adds no wear", () => {
    expect(wearAdded([h("a", 5, 5)], "a").eq(0)).toBe(true);
  });

  it("caps wear at L", () => {
    expect(wearEnd("360", "10", 365).eq(365)).toBe(true);
    expect(wearEnd("100", "2.5", 365).eq("102.5")).toBe(true);
  });

  it("rejects unknown items and open holdings without an end", () => {
    expect(() => wearAdded([h("a", 0, 1)], "zzz")).toThrow(RangeError);
    expect(() => wearAdded([h("a", 0, null)], "a")).toThrow(RangeError);
  });

  it("uses Colombo calendar days (UTC+05:30)", () => {
    // 18:29 UTC = 23:59 Colombo, 18:30 UTC = 00:00 next day in Colombo
    const before = colomboDay(new Date("2026-10-10T18:29:00Z"));
    const after = colomboDay(new Date("2026-10-10T18:30:00Z"));
    expect(after - before).toBe(1);
    expect(colomboDay(new Date("2026-10-10T00:00:00+05:30"))).toBe(before);
  });
});
