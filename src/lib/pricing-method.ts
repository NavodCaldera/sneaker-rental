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
      "Highest when brand new and falls fastest at first, then more gently. Well-worn pairs stay pricier than on the S-curve.",
  },
];

export function pricingMethodLabel(method: PricingMethod) {
  return PRICING_METHOD_OPTIONS.find((m) => m.value === method)!.label;
}

export function pricingMethodShort(method: PricingMethod) {
  return PRICING_METHOD_OPTIONS.find((m) => m.value === method)!.short;
}
