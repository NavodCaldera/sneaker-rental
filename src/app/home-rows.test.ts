import { describe, expect, it } from "vitest";
import { D } from "@/lib/decimal";
import { type HomeItem, homeRows } from "./home-rows";

const item = (
  id: string,
  over: Partial<Omit<HomeItem<string>, "card">> = {},
): HomeItem<string> => ({
  card: id,
  status: "AVAILABLE",
  condition: "NEW",
  price: new D(20),
  discount: new D(0),
  ...over,
});

describe("home rows", () => {
  it("puts discounted pairs first, biggest discount first, then the lower price", () => {
    const rows = homeRows([
      item("a", { discount: new D("0.025") }),
      item("b"),
      item("c", { discount: new D("0.1"), price: new D(30) }),
      item("d", { discount: new D("0.1"), price: new D(10) }),
      item("e", { discount: new D("0.05"), status: "WITH_BORROWER" }),
    ]);
    expect(rows[0].title).toBe("Exceptional Value");
    expect(rows[0].items.map((i) => i.card)).toEqual(["d", "c", "e", "a"]);
    expect(rows[1].title).toBe("Just listed");
  });

  it("leaves Exceptional Value out when nothing is discounted, and names the style", () => {
    const rows = homeRows([item("a"), item("b", { condition: "SECOND_HAND" })], "Running");
    expect(rows.map((r) => r.title)).toEqual([
      "Just listed in Running",
      "Best value today in Running",
      "Brand new pairs",
      "Pre-loved and upgraded",
    ]);
  });

  it("names the tab in Exceptional Value too", () => {
    expect(homeRows([item("a", { discount: new D("0.05") })], "Women")[0].title).toBe(
      "Exceptional Value in Women",
    );
  });

  it("shows at most 12 pairs a row", () => {
    const many = Array.from({ length: 20 }, (_, i) => item(`p${i}`, { discount: new D("0.01") }));
    expect(homeRows(many)[0].items).toHaveLength(12);
  });
});
