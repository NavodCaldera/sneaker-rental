import type { Gender, SizeSystem } from "@/generated/prisma/enums";
import { formatSize, normalizeSize, parseSize } from "./shoe-size";
import type { SHOP_AUDIENCES } from "./shoe-style";

/**
 * A customer's personal profile (product owner, 2026-10-13). Nova is a transformation economy:
 * each account belongs to one person, who tells us at sign-up their shoe size, gender, date of
 * birth and "Whom do you want to become?". They are then shown shoes in their size, for their
 * gender and age, with pairs made for who they want to become first. Shared by the server and
 * client forms. It never changes a price: prices come only from the pricing engine.
 */

export const BECOMING_QUESTION = "Whom do you want to become?";

export const GENDERS: { value: Gender; label: string }[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

export type Persona = {
  key: string;
  name: string;
  line: string;
  /** The experiences (adult and kids') whose pairs suit this persona */
  experiences: string[];
};

/**
 * The answers to "Whom do you want to become?", in form order. Each maps onto the experience
 * names pairs are listed with (`EXPERIENCES` in `shoe-style.ts`), so every experience belongs to
 * at least one persona.
 */
export const PERSONAS: Persona[] = [
  {
    key: "ATHLETE",
    name: "The Athlete",
    line: "Faster and stronger, every morning",
    experiences: ["Morning Run", "Gym Session", "Studio & Gym", "Game Day", "Sports Day"],
  },
  {
    key: "PROFESSIONAL",
    name: "The Professional",
    line: "Sharp, trusted and ready for the room",
    experiences: ["Work Day", "School Day"],
  },
  {
    key: "EXPLORER",
    name: "The Explorer",
    line: "New streets and new places every weekend",
    experiences: ["Weekend Stroll", "Brunch & Errands", "Weekend Fun", "Playtime"],
  },
  {
    key: "CREATIVE",
    name: "The Creative",
    line: "Your own style, on your own terms",
    experiences: ["Street Session", "Brunch & Errands", "Playtime"],
  },
  {
    key: "ICON",
    name: "The Icon",
    line: "The one everyone remembers",
    experiences: ["Night Out", "Big Occasion", "Party Time"],
  },
];

export const PERSONA_KEYS = PERSONAS.map((p) => p.key);

/** "The Athlete and The Icon", in form order; unknown keys are skipped. */
export function personaNames(keys: readonly string[]) {
  const names = PERSONAS.filter((p) => keys.includes(p.key)).map((p) => p.name);
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Every experience that suits any of the chosen personas. */
export function personaExperiences(keys: readonly string[]) {
  return new Set(PERSONAS.filter((p) => keys.includes(p.key)).flatMap((p) => p.experiences));
}

/** True when a pair is made for one of the persona's experiences. */
export function suitsPersona(experiences: readonly string[], keys: readonly string[]) {
  const wanted = personaExperiences(keys);
  return experiences.some((x) => wanted.has(x));
}

/** The items whose pairs suit the persona first, keeping the order within each group. */
export function rankForPersona<T>(
  items: T[],
  experiencesOf: (item: T) => readonly string[],
  keys: readonly string[],
): T[] {
  if (keys.length === 0) return items;
  const fits = items.filter((i) => suitsPersona(experiencesOf(i), keys));
  return [...fits, ...items.filter((i) => !fits.includes(i))];
}

/** Customers younger than this are shown kids' pairs (Boys or Girls). */
export const KIDS_UNDER_AGE = 13;
/** The oldest age we accept, to catch a typo in the year. */
export const MAX_AGE = 120;

/** A date-only value as "YYYY-MM-DD" (Prisma returns DATE columns at UTC midnight). */
export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Whole years from a date of birth to a day, both "YYYY-MM-DD". */
export function ageOn(dateOfBirth: string, today: string) {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const hadBirthday = tm > bm || (tm === bm && td >= bd);
  return ty - by - (hadBirthday ? 0 : 1);
}

export type ShopAudience = (typeof SHOP_AUDIENCES)[number]["value"];

/** The pairs a person is shown: Men or Women, or Boys or Girls under 13. */
export function profileAudience(gender: Gender, dateOfBirth: string, today: string): ShopAudience {
  const child = ageOn(dateOfBirth, today) < KIDS_UNDER_AGE;
  if (gender === "FEMALE") return child ? "GIRLS" : "WOMEN";
  return child ? "BOYS" : "MEN";
}

/** A profile's shoe size from the form's system and number, e.g. ("UK", "9.0") → "UK 9". */
export function profileShoeSize(system: string, value: string) {
  if (system !== "UK" && system !== "EU" && system !== "US") return null;
  const v = value.trim();
  if (!/^\d{1,2}(\.\d)?$/.test(v) || Number(v) <= 0) return null;
  return formatSize(system as SizeSystem, normalizeSize(v));
}

/** The system and number of a stored profile size, for the form. */
export function splitShoeSize(size: string | null | undefined) {
  const parsed = parseSize(size ?? "");
  return parsed && parsed.system !== "CM"
    ? { system: parsed.system as SizeSystem, value: parsed.value }
    : { system: "UK" as SizeSystem, value: "" };
}

/** The parts of a user the profile needs. */
export type ProfileUser = {
  dateOfBirth: Date | null;
  gender: Gender | null;
  shoeSize: string | null;
  becoming: string[];
};

/** What Browse and the Closet start from, or null until the profile is filled in. */
export function shoppingProfile(user: ProfileUser, today: string) {
  if (!user.dateOfBirth || !user.gender || !user.shoeSize) return null;
  return {
    audience: profileAudience(user.gender, isoDate(user.dateOfBirth), today),
    size: user.shoeSize,
    becoming: user.becoming,
  };
}
