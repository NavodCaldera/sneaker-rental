import { describe, expect, it } from "vitest";
import { closetSlotsFor } from "./closet";
import { OCCASIONS } from "./curated-packs";

describe("OCCASIONS", () => {
  it("has the product owner's titles, in order", () => {
    expect(OCCASIONS.map((o) => o.name)).toEqual([
      "Endurance & Relentless Grit",
      "Executive Presence",
      "Clarity, Reset & Grounding",
      "Milestones & The Spotlight",
    ]);
  });

  it("matches the adult Closet slots, and each card keeps its experience as the short name", () => {
    expect(OCCASIONS.map((o) => o.experience)).toEqual(
      closetSlotsFor("MEN").map((s) => s.experience),
    );
    for (const o of OCCASIONS) {
      expect(o.shortName).toBe(o.experience);
    }
  });
});
