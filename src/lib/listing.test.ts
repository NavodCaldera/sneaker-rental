import { describe, expect, it } from "vitest";
import { D } from "./decimal";
import { cardPair, groupByListing, sizeRange } from "./listing";

describe("listings", () => {
  it("groups pairs by listing, in the order each listing first appears", () => {
    const pairs = [
      { id: "a1", listingId: "a" },
      { id: "b1", listingId: "b" },
      { id: "a2", listingId: "a" },
    ];
    expect(groupByListing(pairs).map((g) => g.map((p) => p.id))).toEqual([["a1", "a2"], ["b1"]]);
  });

  it("shows the pair with the biggest discount, then the lowest price", () => {
    const score = (p: { d: string; p: string }) => ({ discount: new D(p.d), price: new D(p.p) });
    const pick = (group: { d: string; p: string }[]) => cardPair(group, score);
    expect(
      pick([
        { d: "0", p: "20" },
        { d: "0.05", p: "30" },
      ]),
    ).toEqual({ d: "0.05", p: "30" });
    expect(
      pick([
        { d: "0", p: "20" },
        { d: "0", p: "15" },
      ]),
    ).toEqual({ d: "0", p: "15" });
  });

  it("writes a listing's sizes compactly, smallest first", () => {
    expect(sizeRange(["UK 9"])).toBe("UK 9");
    expect(sizeRange(["UK 9", "UK 7", "UK 8.5", "UK 7"])).toBe("UK 7, 8.5, 9");
    expect(sizeRange(["EU 38", "UK 3"])).toBe("UK 3, EU 38");
    expect(sizeRange([])).toBe("");
  });
});
