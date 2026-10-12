import type { Audience } from "@/generated/prisma/enums";

/**
 * "Your Nova Closet" (`/closet`): a borrower plans a rotation of pairs, one per part of their
 * week, for one person and one size, then adds it to their bundle. Shared by the page (server)
 * and the planner (client). The plan is a draft kept in a cookie so it survives a reload or a
 * sign-in; it is never a booking and holds no prices.
 */

/** Cookie holding the draft plan (readable by the page so it renders with no flash). */
export const CLOSET_COOKIE = "nova_closet";
/** Most slots a plan can have (borrowers can hold any number of pairs; this only bounds the cookie). */
export const MAX_CLOSET_SLOTS = 24;

export type ClosetSlot = {
  /** The experience this slot is for ("Work Day"), or null for an extra pair. */
  experience: string | null;
  shoeId: string | null;
};

export type ClosetDraft = {
  /** The shopping tab, lowercase ("men"), as in `?for=`. */
  for: string;
  /** The size searched, e.g. "UK 9", as in `?size=`. */
  size: string;
  slots: ClosetSlot[];
};

/** The starting slots: the four moments of an adult's week, or a child's. */
export function closetSlotsFor(audience: Audience): ClosetSlot[] {
  const kids = audience === "BOYS" || audience === "GIRLS";
  const moments = kids
    ? ["School Day", "Sports Day", "Playtime", "Party Time"]
    : ["Morning Run", "Work Day", "Weekend Stroll", "Night Out"];
  return moments.map((experience) => ({ experience, shoeId: null }));
}

/** A slot's title: its experience, or "Extra pair". */
export function slotTitle(slot: ClosetSlot) {
  return slot.experience ?? "Extra pair";
}

/** Reads the draft cookie; anything malformed is ignored. */
export function parseClosetDraft(raw: string | undefined): ClosetDraft | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (typeof v?.for !== "string" || typeof v?.size !== "string" || !Array.isArray(v.slots)) {
      return null;
    }
    const slots = (v.slots as unknown[])
      .slice(0, MAX_CLOSET_SLOTS)
      .filter((s): s is ClosetSlot => {
        const o = s as ClosetSlot;
        return (
          typeof o === "object" &&
          o !== null &&
          (o.experience === null || typeof o.experience === "string") &&
          (o.shoeId === null || typeof o.shoeId === "string")
        );
      })
      .map((s) => ({ experience: s.experience, shoeId: s.shoeId }));
    return { for: v.for, size: v.size, slots };
  } catch {
    return null;
  }
}

/**
 * Puts a pair in the plan, taking it out of any other slot first: into `target` if given
 * (replacing what was there), else the first empty slot made for one of its experiences, else
 * the first empty slot, else a new extra slot at the end.
 */
export function placePair(
  slots: ClosetSlot[],
  pair: { id: string; experiences: string[] },
  target?: number,
): ClosetSlot[] {
  const next = slots.map((s) => (s.shoeId === pair.id ? { ...s, shoeId: null } : { ...s }));
  if (target !== undefined && next[target]) {
    next[target].shoeId = pair.id;
    return next;
  }
  const fits = next.findIndex(
    (s) => s.shoeId === null && s.experience !== null && pair.experiences.includes(s.experience),
  );
  const empty = fits >= 0 ? fits : next.findIndex((s) => s.shoeId === null);
  if (empty >= 0) {
    next[empty].shoeId = pair.id;
    return next;
  }
  if (next.length >= MAX_CLOSET_SLOTS) return next;
  return [...next, { experience: null, shoeId: pair.id }];
}

/**
 * The first plan for a size: the borrower's bundle pairs first, then, for each slot still
 * empty, the first pair made for its experience. Slots with no fitting pair stay empty.
 */
export function startingPlan(
  slots: ClosetSlot[],
  pairs: { id: string; experiences: string[] }[],
  bundle: string[],
): ClosetSlot[] {
  let plan = slots.map((s) => ({ ...s }));
  for (const id of bundle) {
    const pair = pairs.find((p) => p.id === id);
    if (pair) plan = placePair(plan, pair);
  }
  const used = new Set(plan.map((s) => s.shoeId));
  for (const slot of plan) {
    if (slot.shoeId || !slot.experience) continue;
    const match = pairs.find((p) => !used.has(p.id) && p.experiences.includes(slot.experience!));
    if (match) {
      slot.shoeId = match.id;
      used.add(match.id);
    }
  }
  return plan;
}

/** Keeps a saved plan's slots, dropping pairs that are no longer offered in this size. */
export function keepOffered(slots: ClosetSlot[], offered: Set<string>): ClosetSlot[] {
  const seen = new Set<string>();
  return slots.map((s) => {
    const ok = s.shoeId !== null && offered.has(s.shoeId) && !seen.has(s.shoeId);
    if (ok) seen.add(s.shoeId!);
    return { experience: s.experience, shoeId: ok ? s.shoeId : null };
  });
}
