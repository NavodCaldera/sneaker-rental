import type { Audience } from "@/generated/prisma/enums";

/**
 * Who a pair is for and the experience it's made for (product owner, 2026-10-11). Borrowers
 * shop by audience first (Men, Women, Boys, Girls), then by experience, named after the moment
 * ("Work Day", "Night Out") rather than the use. Shared by the server and client forms.
 */

/** The tabs borrowers shop by, in order. A Unisex pair shows under Men and under Women. */
export const SHOP_AUDIENCES: { value: Exclude<Audience, "UNISEX">; label: string }[] = [
  { value: "MEN", label: "Men" },
  { value: "WOMEN", label: "Women" },
  { value: "BOYS", label: "Boys" },
  { value: "GIRLS", label: "Girls" },
];

/** What a merchant can choose when listing, in form order. */
export const LISTING_AUDIENCES: { value: Audience; label: string }[] = [
  { value: "MEN", label: "Men" },
  { value: "WOMEN", label: "Women" },
  { value: "UNISEX", label: "Unisex (men and women)" },
  { value: "BOYS", label: "Boys" },
  { value: "GIRLS", label: "Girls" },
];

const MEN = [
  "Morning Run",
  "Work Day",
  "Game Day",
  "Gym Session",
  "Night Out",
  "Street Session",
  "Weekend Stroll",
  "Big Occasion",
];
const WOMEN = [
  "Morning Run",
  "Work Day",
  "Studio & Gym",
  "Brunch & Errands",
  "Night Out",
  "Weekend Stroll",
  "Big Occasion",
];
const KIDS = ["School Day", "Sports Day", "Playtime", "Party Time", "Weekend Fun"];

/**
 * The experiences each audience offers, in chip order. A pair can be made for several of its
 * audience's experiences (product owner, 2026-10-12); Unisex pairs can take any adult one.
 */
export const EXPERIENCES: Record<Audience, string[]> = {
  MEN,
  WOMEN,
  UNISEX: [...new Set([...MEN, ...WOMEN])],
  BOYS: KIDS,
  GIRLS: KIDS,
};

/** Every experience, for the Browse filter. */
export const ALL_EXPERIENCES = [...new Set([...EXPERIENCES.UNISEX, ...KIDS])];

/** The listings a shopping tab shows: Men and Women include Unisex pairs. */
export function audiencesFor(tab: Audience): Audience[] {
  return tab === "MEN" || tab === "WOMEN" ? [tab, "UNISEX"] : [tab];
}

export function audienceLabel(audience: Audience) {
  return audience === "UNISEX"
    ? "Unisex"
    : LISTING_AUDIENCES.find((a) => a.value === audience)!.label;
}

/** "Women · Night Out, Work Day", shown on cards and listings. */
export function styleLabel(shoe: { audience: Audience; experiences: string[] }) {
  return `${audienceLabel(shoe.audience)} · ${shoe.experiences.join(", ")}`;
}

/** Reads `?for=` (men, women, boys, girls); anything else means all. */
export function parseShopAudience(v: string | undefined) {
  return SHOP_AUDIENCES.find((a) => a.value === v?.toUpperCase())?.value;
}
