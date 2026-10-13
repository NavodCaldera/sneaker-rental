import type { Gender, SizeSystem } from "@/generated/prisma/enums";
import { SIZE_KEY, chartFor, formatSize, normalizeSize, parseSize } from "./shoe-size";
import type { SHOP_AUDIENCES } from "./shoe-style";

/**
 * A customer's personal profile (product owner, 2026-10-13). Nova is a transformation economy:
 * each account belongs to one person, who tells us at sign-up their shoe size, gender, date of
 * birth and, in their own words, "Whom do you want to become?": the personality they want and
 * how people should see them. They are then shown shoes in their size, for their gender and age,
 * with pairs that suit who they want to become first. Shared by the server and client forms. It
 * never changes a price: prices come only from the pricing engine.
 */

export const BECOMING_QUESTION = "Whom do you want to become?";
export const BECOMING_HINT =
  "A few words about the personality you want to have and how people should see you.";
/** The example we give (product owner, 2026-10-13). */
export const BECOMING_EXAMPLE = "I want to build Sri Lanka's largest tech sensation";

/**
 * Personality types shown as ideas in the box (product owner, 2026-10-13), so customers can
 * picture the person they want to become. Each uses words `personasFromStory` reads.
 */
export const BECOMING_IDEAS = [
  "a confident leader people trust",
  "a calm, sharp professional",
  "a bold creative with my own style",
  "a fit, energetic athlete",
  "a curious explorer who loves to travel",
  "the star of every party",
];

/** The box's placeholder: our example, then the personality ideas. */
export const BECOMING_PLACEHOLDER =
  `${BECOMING_EXAMPLE}. People see me as sharp, calm and always ready.\n\n` +
  `Other ideas: ${BECOMING_IDEAS.join(" · ")}`;
export const BECOMING_MIN = 10;
export const BECOMING_MAX = 500;

/**
 * Why we ask for the date of birth (product owner, 2026-10-13): to celebrate with them (no rent
 * in their birthday month for up to `freePairs` pairs) and to show under-13s kids' shoes.
 */
export function birthdayReason(freePairs: number) {
  const pairs = freePairs === 1 ? "pair" : "pairs";
  const gift =
    freePairs > 0
      ? `We value your celebrations: in your birthday month, rent is on us for up to ${freePairs} ${pairs}. `
      : "";
  return `${gift}Under 13s are shown kids' shoes. Your date of birth stays private.`;
}

/** True when `today` ("YYYY-MM-DD") is in the calendar month of the date of birth. */
export function inBirthdayMonth(dateOfBirth: string, today: string) {
  return dateOfBirth.slice(5, 7) === today.slice(5, 7);
}

export const GENDERS: { value: Gender; label: string }[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

export type Persona = {
  key: string;
  /** Internal name; customers don't see it */
  name: string;
  /** The experiences (adult and kids') whose pairs suit this persona */
  experiences: string[];
  /** Words in a customer's answer that point to this persona (lower case, whole words) */
  words: string[];
};

/**
 * What Nova reads in an answer to "Whom do you want to become?". Each persona maps onto the
 * experience names pairs are listed with (`EXPERIENCES` in `shoe-style.ts`), so every experience
 * belongs to at least one persona. "I want to build Sri Lanka's largest tech sensation" is The
 * Professional (build, tech) and The Icon (sensation).
 */
export const PERSONAS: Persona[] = [
  {
    key: "ATHLETE",
    name: "The Athlete",
    experiences: ["Morning Run", "Gym Session", "Studio & Gym", "Game Day", "Sports Day"],
    words: [
      "athlete",
      "athletic",
      "sport",
      "sports",
      "sporty",
      "run",
      "runner",
      "running",
      "marathon",
      "fit",
      "fitness",
      "gym",
      "train",
      "training",
      "strong",
      "stronger",
      "fast",
      "faster",
      "champion",
      "cricket",
      "football",
      "rugby",
      "tennis",
      "healthy",
      "active",
      "energetic",
    ],
  },
  {
    key: "PROFESSIONAL",
    name: "The Professional",
    experiences: ["Work Day", "School Day"],
    words: [
      "professional",
      "business",
      "businessman",
      "businesswoman",
      "entrepreneur",
      "founder",
      "ceo",
      "leader",
      "lead",
      "leading",
      "manager",
      "boss",
      "executive",
      "career",
      "company",
      "startup",
      "tech",
      "technology",
      "engineer",
      "developer",
      "lawyer",
      "doctor",
      "banker",
      "build",
      "builder",
      "office",
      "corporate",
      "trusted",
      "sharp",
      "smart",
      "successful",
      "student",
      "scholar",
      "teacher",
    ],
  },
  {
    key: "EXPLORER",
    name: "The Explorer",
    experiences: ["Weekend Stroll", "Brunch & Errands", "Weekend Fun", "Playtime"],
    words: [
      "explore",
      "explorer",
      "exploring",
      "travel",
      "traveller",
      "traveler",
      "travelling",
      "adventure",
      "adventurous",
      "journey",
      "outdoors",
      "nature",
      "wander",
      "discover",
      "free",
      "relaxed",
      "easygoing",
      "calm",
      "weekend",
      "curious",
    ],
  },
  {
    key: "CREATIVE",
    name: "The Creative",
    experiences: ["Street Session", "Brunch & Errands", "Playtime"],
    words: [
      "creative",
      "artist",
      "artistic",
      "art",
      "design",
      "designer",
      "music",
      "musician",
      "singer",
      "dancer",
      "photographer",
      "writer",
      "fashion",
      "stylish",
      "style",
      "unique",
      "original",
      "street",
      "skater",
      "creator",
      "content",
    ],
  },
  {
    key: "ICON",
    name: "The Icon",
    experiences: ["Night Out", "Big Occasion", "Party Time"],
    words: [
      "icon",
      "iconic",
      "famous",
      "fame",
      "star",
      "celebrity",
      "sensation",
      "influencer",
      "legend",
      "remembered",
      "admired",
      "glamorous",
      "elegant",
      "party",
      "nightlife",
      "bold",
      "confident",
      "charming",
      "attractive",
      "popular",
    ],
  },
];

export const PERSONA_KEYS = PERSONAS.map((p) => p.key);

/** The personas an answer points to, in `PERSONAS` order (none when no word matches). */
export function personasFromStory(story: string) {
  const words = new Set(story.toLowerCase().match(/[a-z]+/g) ?? []);
  // "travels" and "designers" count as "travel" and "designer".
  return PERSONAS.filter((p) => p.words.some((w) => words.has(w) || words.has(`${w}s`))).map(
    (p) => p.key,
  );
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

/** The sizes children can have: no kids' chart yet, so a plausible range per system. */
const KIDS_SIZE_RANGE: Record<SizeSystem, [number, number]> = {
  UK: [0, 13.5],
  EU: [16, 40],
  US: [0, 13.5],
};

/**
 * Checks a profile size against who is wearing it: adults must be on their gender's size chart
 * (women's for Female, men's for Male), in the system they picked; under 13s within the kids'
 * range. Returns a message, or null when the size is right. `shoeSize` is as from `profileShoeSize`.
 */
export function shoeSizeProblem(
  shoeSize: string,
  gender: Gender,
  dateOfBirth: string,
  today: string,
): string | null {
  const parsed = parseSize(shoeSize);
  if (!parsed || parsed.system === "CM") return null;
  const system = parsed.system as SizeSystem;
  const audience = profileAudience(gender, dateOfBirth, today);
  if (audience === "BOYS" || audience === "GIRLS") {
    const [min, max] = KIDS_SIZE_RANGE[system];
    const n = Number(parsed.value);
    return n >= min && n <= max
      ? null
      : `Kids' sizes run from ${system} ${min} to ${max}. Check the size on the label`;
  }
  const chart = chartFor(audience === "WOMEN" ? "WOMEN" : "MEN")!;
  const key = SIZE_KEY[system];
  const sizes = chart.rows.map((r) => r[key]);
  return sizes.includes(parsed.value)
    ? null
    : `${chart.name} sizes run from ${system} ${sizes[0]} to ${sizes[sizes.length - 1]} in half sizes. Check the size and the system (UK, EU, US)`;
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
  becomingStory: string | null;
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
