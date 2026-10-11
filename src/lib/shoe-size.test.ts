import { describe, expect, it } from "vitest";
import {
  MEN_SIZES,
  WOMEN_SIZES,
  parseSize,
  shoeSizeFields,
  sizeEquivalents,
  sizeSummary,
  sortSizes,
} from "./shoe-size";

describe("size charts", () => {
  it("has one row per size, each system rising with it", () => {
    for (const rows of [WOMEN_SIZES, MEN_SIZES]) {
      for (const key of ["uk", "eu", "us"] as const) {
        const values = rows.map((r) => Number(r[key]));
        expect(new Set(values).size).toBe(rows.length);
        expect(values).toEqual([...values].sort((a, b) => a - b));
      }
    }
  });
});

describe("shoeSizeFields", () => {
  it("fills every system from the chart for who the pair is for", () => {
    expect(shoeSizeFields("WOMEN", "EU", "39")).toEqual({
      size: "EU 39",
      sizeSystem: "EU",
      sizeUk: "6",
      sizeEu: "39",
      sizeUs: "8.5",
      sizeCm: "24.5",
    });
    // Same UK size, men's chart: a different US size.
    expect(shoeSizeFields("MEN", "UK", "6").sizeUs).toBe("6.5");
    // Unisex pairs use the men's chart.
    expect(shoeSizeFields("UNISEX", "US", "9.5").sizeUk).toBe("9");
    expect(shoeSizeFields("MEN", "UK", "09.50").size).toBe("UK 9.5");
  });

  it("keeps only the listed size for kids' pairs and sizes off the chart", () => {
    expect(shoeSizeFields("BOYS", "UK", "3")).toEqual({
      size: "UK 3",
      sizeSystem: "UK",
      sizeUk: "3",
      sizeEu: null,
      sizeUs: null,
      sizeCm: null,
    });
    expect(shoeSizeFields("WOMEN", "UK", "9").sizeEu).toBeNull();
  });
});

describe("showing and searching sizes", () => {
  const shoe = { audience: "WOMEN" as const, ...shoeSizeFields("WOMEN", "EU", "39") };

  it("shows the listed size first, then the borrower's system", () => {
    expect(sizeSummary(shoe)).toBe("EU 39 · UK 6");
    expect(sizeSummary(shoe, "US")).toBe("EU 39 · US 8.5");
    expect(sizeSummary(shoe, "CM")).toBe("EU 39 · 24.5 cm");
    expect(sizeSummary({ audience: "MEN", ...shoeSizeFields("MEN", "UK", "9") })).toBe(
      "UK 9 · EU 43",
    );
    expect(sizeSummary({ audience: "BOYS", ...shoeSizeFields("BOYS", "UK", "3") })).toBe("UK 3");
  });

  it("reads the Size filter", () => {
    expect(parseSize("UK 6")).toEqual({ system: "UK", value: "6" });
    expect(parseSize(" eu39 ")).toEqual({ system: "EU", value: "39" });
    expect(parseSize("24.5 cm")).toEqual({ system: "CM", value: "24.5" });
    expect(parseSize("9")).toBeNull();
    expect(parseSize("JP 26")).toBeNull();
    expect(parseSize(undefined)).toBeNull();
  });

  it("says what a size is in the other systems, per chart", () => {
    expect(sizeEquivalents("UK", "6")).toEqual([
      { chart: "Women's", rows: [{ uk: "6", eu: "39", us: "8.5", cm: "24.5" }] },
      { chart: "Men's", rows: [{ uk: "6", eu: "39", us: "6.5", cm: "24.5" }] },
    ]);
    // 23 cm is two women's sizes, and no men's size.
    expect(sizeEquivalents("CM", "23")).toEqual([
      {
        chart: "Women's",
        rows: [
          { uk: "3.5", eu: "36", us: "6", cm: "23" },
          { uk: "4", eu: "37", us: "6.5", cm: "23" },
        ],
      },
    ]);
    expect(sizeEquivalents("UK", "13")).toEqual([]);
  });

  it("sorts sizes by number", () => {
    expect(sortSizes(["10", "9.5", "9", "10", "13", "2"])).toEqual(["2", "9", "9.5", "10", "13"]);
  });
});
