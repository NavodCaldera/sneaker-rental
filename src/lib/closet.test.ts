import { describe, expect, it } from "vitest";
import {
  closetSlotsFor,
  keepOffered,
  parseClosetDraft,
  placePair,
  startingPlan,
  type ClosetSlot,
} from "./closet";

const run = { id: "run", experiences: ["Morning Run"] };
const work = { id: "work", experiences: ["Work Day", "Night Out"] };
const loafer = { id: "loafer", experiences: ["Big Occasion"] };

describe("closetSlotsFor", () => {
  it("gives adults and kids their own moments", () => {
    expect(closetSlotsFor("MEN").map((s) => s.experience)).toEqual([
      "Morning Run",
      "Work Day",
      "Weekend Stroll",
      "Night Out",
    ]);
    expect(closetSlotsFor("GIRLS")[0].experience).toBe("School Day");
  });
});

describe("placePair", () => {
  const empty = closetSlotsFor("MEN");

  it("fills the first empty slot made for one of the pair's experiences", () => {
    expect(placePair(empty, work).findIndex((s) => s.shoeId === "work")).toBe(1);
  });

  it("uses the first empty slot when no slot fits, then adds an extra slot", () => {
    expect(placePair(empty, loafer)[0].shoeId).toBe("loafer");
    const full: ClosetSlot[] = empty.map((s, i) => ({ ...s, shoeId: `p${i}` }));
    const next = placePair(full, loafer);
    expect(next).toHaveLength(5);
    expect(next[4]).toEqual({ experience: null, shoeId: "loafer" });
  });

  it("puts the pair in the chosen slot, replacing its pair, and never twice", () => {
    let plan = placePair(empty, run);
    plan = placePair(plan, run, 3);
    expect(plan.map((s) => s.shoeId)).toEqual([null, null, null, "run"]);
  });
});

describe("startingPlan", () => {
  it("places bundle pairs first, then fills slots only with pairs made for them", () => {
    const plan = startingPlan(closetSlotsFor("MEN"), [run, work, loafer], ["work"]);
    expect(plan.map((s) => s.shoeId)).toEqual(["run", "work", null, null]);
  });

  it("ignores bundle pairs that are not offered in this size", () => {
    const plan = startingPlan(closetSlotsFor("MEN"), [run], ["elsewhere"]);
    expect(plan.map((s) => s.shoeId)).toEqual(["run", null, null, null]);
  });
});

describe("parseClosetDraft and keepOffered", () => {
  it("reads a saved plan and drops malformed slots", () => {
    const raw = JSON.stringify({
      for: "men",
      size: "UK 9",
      slots: [{ experience: "Work Day", shoeId: "a" }, { experience: 3 }, null],
    });
    expect(parseClosetDraft(raw)).toEqual({
      for: "men",
      size: "UK 9",
      slots: [{ experience: "Work Day", shoeId: "a" }],
    });
    expect(parseClosetDraft("not json")).toBeNull();
    expect(parseClosetDraft(undefined)).toBeNull();
  });

  it("empties slots whose pair is no longer offered or repeated", () => {
    const slots = [
      { experience: "Work Day", shoeId: "a" },
      { experience: null, shoeId: "gone" },
      { experience: null, shoeId: "a" },
    ];
    expect(keepOffered(slots, new Set(["a"])).map((s) => s.shoeId)).toEqual(["a", null, null]);
  });
});
