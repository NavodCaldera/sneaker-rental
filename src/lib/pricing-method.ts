import type { PricingMethod } from "@/generated/prisma/enums";

/**
 * The price curves a merchant can pick when listing a pair (pricing-spec.md §2), in form
 * order. Both start at the new price, end at the same end-of-life price share (the floor q)
 * and earn the same in total; only how the price falls in between differs.
 */
export const PRICING_METHOD_OPTIONS: {
  value: PricingMethod;
  label: string;
  short: string;
  description: string;
}[] = [
  {
    value: "LOGISTIC",
    label: "S-curve (logistic decay)",
    short: "S-curve",
    description:
      "Stays close to the new price while the pair is fresh, falls fastest in mid-life, then levels off.",
  },
  {
    value: "EXPONENTIAL",
    label: "Exponential decay",
    short: "Exponential",
    description:
      "Highest when new and falls fastest at first, then more gently. Well-worn pairs stay pricier than on the S-curve.",
  },
];

/**
 * How to choose (product owner, 2026-10-12): the price should fall the way the pair's quality
 * does, so the merchant picks the curve that matches how this pair wears out. Shown behind
 * the "?" next to "Pricing method".
 */
export const PRICING_METHOD_HELP = {
  title: "Pick the curve that matches how this pair wears",
  intro: "Its price should fall the way its quality does.",
  reasons: {
    LOGISTIC:
      "Choose the S-curve if the pair stays like new for a good while, then wears faster in mid-life and settles, e.g. sturdy leather or well-built trainers.",
    EXPONENTIAL:
      "Choose exponential decay if the pair loses its fresh look and feel early (first creases, scuffs and sole wear), then wears slowly, e.g. white, suede or knit uppers.",
  } satisfies Record<PricingMethod, string>,
};

export function pricingMethodLabel(method: PricingMethod) {
  return PRICING_METHOD_OPTIONS.find((m) => m.value === method)!.label;
}

export function pricingMethodShort(method: PricingMethod) {
  return PRICING_METHOD_OPTIONS.find((m) => m.value === method)!.short;
}
