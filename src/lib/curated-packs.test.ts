import { describe, expect, it } from "vitest";
import { closetSlotsFor } from "./closet";
import { OCCASIONS } from "./curated-packs";

describe("OCCASIONS", () => {
  it("has the product owner's titles, in order", () => {
    expect(OCCASIONS.map((o) => o.name)).toEqual([
      "Morning Run & Performance",
      "The Daily Commute & Work Day",
      "Weekend Stroll & Brunch",
      "Night Out & Big Occasions",
    ]);
  });

  it("matches the adult Closet slots, and each title names its experience", () => {
    expect(OCCASIONS.map((o) => o.experience)).toEqual(
      closetSlotsFor("MEN").map((s) => s.experience),
    );
    for (const o of OCCASIONS) {
      expect(o.name).toContain(o.experience);
      expect(o.shortName).toBe(o.experience);
    }
  });
});
