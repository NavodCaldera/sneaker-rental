import { describe, expect, it } from "vitest";
import {
  PERSONAS,
  ageOn,
  birthdayReason,
  inBirthdayMonth,
  personasFromStory,
  profileAudience,
  profileShoeSize,
  rankForPersona,
  shoppingProfile,
  splitShoeSize,
  suitsPersona,
} from "./borrower-profile";
import { ALL_EXPERIENCES } from "./shoe-style";

describe("customer profile", () => {
  it("gives every experience pairs are listed with to at least one persona", () => {
    const covered = new Set(PERSONAS.flatMap((p) => p.experiences));
    expect(ALL_EXPERIENCES.filter((x) => !covered.has(x))).toEqual([]);
    // And names only real experiences.
    expect([...covered].filter((x) => !ALL_EXPERIENCES.includes(x))).toEqual([]);
  });

  it("counts whole years, turning a year older on the birthday", () => {
    expect(ageOn("1993-07-02", "2026-07-01")).toBe(32);
    expect(ageOn("1993-07-02", "2026-07-02")).toBe(33);
    expect(ageOn("2000-02-29", "2026-02-28")).toBe(25);
    expect(ageOn("2000-02-29", "2026-03-01")).toBe(26);
  });

  it("shows under 13s kids' pairs and everyone else men's or women's", () => {
    expect(profileAudience("MALE", "1993-07-02", "2026-10-13")).toBe("MEN");
    expect(profileAudience("FEMALE", "1993-07-02", "2026-10-13")).toBe("WOMEN");
    expect(profileAudience("MALE", "2013-10-14", "2026-10-13")).toBe("BOYS");
    expect(profileAudience("FEMALE", "2013-10-14", "2026-10-13")).toBe("GIRLS");
    expect(profileAudience("FEMALE", "2013-10-13", "2026-10-13")).toBe("WOMEN");
  });

  it("reads the shoe size from the form as a label", () => {
    expect(profileShoeSize("UK", "9")).toBe("UK 9");
    expect(profileShoeSize("EU", " 42.0 ")).toBe("EU 42");
    expect(profileShoeSize("US", "8.5")).toBe("US 8.5");
    expect(profileShoeSize("CM", "27")).toBeNull();
    expect(profileShoeSize("UK", "0")).toBeNull();
    expect(profileShoeSize("UK", "9.25")).toBeNull();
    expect(splitShoeSize("EU 42")).toEqual({ system: "EU", value: "42" });
    expect(splitShoeSize(null)).toEqual({ system: "UK", value: "" });
  });

  it("puts pairs made for who they want to become first, keeping the order otherwise", () => {
    const pairs = [
      { id: "a", experiences: ["Work Day"] },
      { id: "b", experiences: ["Night Out"] },
      { id: "c", experiences: ["Morning Run"] },
      { id: "d", experiences: ["Big Occasion", "Work Day"] },
    ];
    const order = (keys: string[]) =>
      rankForPersona(pairs, (p) => p.experiences, keys).map((p) => p.id);
    expect(order(["ICON"])).toEqual(["b", "d", "a", "c"]);
    expect(order(["ATHLETE", "PROFESSIONAL"])).toEqual(["a", "c", "d", "b"]);
    expect(order([])).toEqual(["a", "b", "c", "d"]);
    expect(suitsPersona(["Party Time"], ["ICON"])).toBe(true);
  });

  it("reads who they want to become from their own words", () => {
    // The example on the form.
    expect(personasFromStory("I want to build Sri Lanka's largest tech sensation")).toEqual([
      "PROFESSIONAL",
      "ICON",
    ]);
    expect(personasFromStory("A MARATHON runner who loves to Travel.")).toEqual([
      "ATHLETE",
      "EXPLORER",
    ]);
    expect(personasFromStory("A designer people remember")).toEqual(["CREATIVE"]);
    expect(personasFromStory("She travels and designs")).toEqual(["EXPLORER", "CREATIVE"]);
    // Whole words only ("article" isn't "art"), and nothing when no word matches.
    expect(personasFromStory("Someone who reads every article")).toEqual([]);
    for (const p of PERSONAS) expect(p.words.length).toBeGreaterThan(0);
  });

  it("starts shopping from a complete profile only", () => {
    const user = {
      dateOfBirth: new Date("1998-03-14T00:00:00Z"),
      gender: "FEMALE" as const,
      shoeSize: "UK 5",
      becomingStory: "Someone who travels the island",
      becoming: ["EXPLORER"],
    };
    expect(shoppingProfile(user, "2026-10-13")).toEqual({
      audience: "WOMEN",
      size: "UK 5",
      becoming: ["EXPLORER"],
    });
    expect(shoppingProfile({ ...user, shoeSize: null }, "2026-10-13")).toBeNull();
  });

  it("says why we ask for the date of birth, and knows the birthday month", () => {
    expect(birthdayReason(4)).toBe(
      "We value your celebrations: in your birthday month, rent is on us for up to 4 pairs. " +
        "Under 13s are shown kids' shoes. Your date of birth stays private.",
    );
    expect(birthdayReason(0)).toBe(
      "Under 13s are shown kids' shoes. Your date of birth stays private.",
    );
    expect(inBirthdayMonth("1993-10-02", "2026-10-31")).toBe(true);
    expect(inBirthdayMonth("1993-10-02", "2026-11-01")).toBe(false);
  });
});
