import type { ShoeCondition } from "@/generated/prisma/enums";

/** The conditions a merchant can declare when listing a pair, in form order. */
export const SHOE_CONDITIONS: { value: ShoeCondition; label: string; short: string }[] = [
  { value: "NEW", label: "Brand new", short: "New" },
  { value: "SECOND_HAND", label: "Second-hand, no upgrades", short: "Second-hand" },
  { value: "SECOND_HAND_UPGRADED", label: "Second-hand, upgraded", short: "Upgraded" },
];

export function conditionLabel(condition: ShoeCondition) {
  return SHOE_CONDITIONS.find((c) => c.value === condition)!.label;
}

export function conditionShort(condition: ShoeCondition) {
  return SHOE_CONDITIONS.find((c) => c.value === condition)!.short;
}
