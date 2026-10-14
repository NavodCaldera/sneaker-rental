import { describe, expect, it } from "vitest";
import { type StylistShoeItem, matchShoesForOccasion, readStylistReply } from "./stylist";

const shoe = (id: string, experiences: string[], brand = "Nike", model = id): StylistShoeItem => ({
  id,
  brand,
  model,
  experiences,
  priceToday: "LKR 100.00",
  condition: "New",
});

const shoes = [
  shoe("a", ["Morning Run"]),
  shoe("b", ["Work Day"]),
  shoe("c", ["Night Out"]),
  shoe("d", ["Weekend Stroll"], "", ""),
];

describe("readStylistReply", () => {
  it("keeps only offered ids, in order, without repeats, at most three", () => {
    const raw = JSON.stringify({
      advice: "  Stand tall. ",
      recommendedShoeIds: ["c", "zzz", "c", "a", 7, "b", "d"],
    });
    const reply = readStylistReply(raw, shoes);
    expect(reply?.advice).toBe("Stand tall.");
    expect(reply?.suggestedShoes.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });

  it("takes ids out of the advice text", () => {
    const named = JSON.stringify({
      advice: "Wear the Nike Dunk (cmv5id) tonight.",
      recommendedShoeIds: ["cmv5id"],
    });
    expect(readStylistReply(named, [shoe("cmv5id", ["Night Out"], "Nike", "Dunk")])?.advice).toBe(
      "Wear the Nike Dunk tonight.",
    );
  });

  it("reads JSON wrapped in a code fence", () => {
    const raw = '```json\n{"advice":"Go.","recommendedShoeIds":["b"]}\n```';
    expect(readStylistReply(raw, shoes)?.suggestedShoes.map((s) => s.id)).toEqual(["b"]);
  });

  it.each([
    "not json",
    "[]",
    '{"advice":"","recommendedShoeIds":["a"]}',
    '{"advice":"Hi","recommendedShoeIds":"a"}',
    '{"advice":"Hi","recommendedShoeIds":["nope"]}',
  ])("returns null for an unusable reply: %s", (raw) => {
    expect(readStylistReply(raw, shoes)).toBeNull();
  });
});

describe("matchShoesForOccasion", () => {
  it("maps keywords to an experience", () => {
    expect(matchShoesForOccasion("a client meeting", shoes).map((s) => s.id)).toEqual(["b"]);
  });

  it("doesn't match every query on an unbranded pair's empty name", () => {
    expect(matchShoesForOccasion("something else", shoes).map((s) => s.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
