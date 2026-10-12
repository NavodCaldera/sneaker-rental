import type { StylePackStatus } from "@/generated/prisma/enums";

/** How a style pack's status reads in the merchant and admin lists (badge tone + label). */
export const PACK_STATUS: Record<
  StylePackStatus,
  { label: string; tone: "neutral" | "good" | "warn" | "bad" }
> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SUBMITTED: { label: "Waiting for review", tone: "warn" },
  PUBLISHED: { label: "Published", tone: "good" },
  REJECTED: { label: "Needs changes", tone: "bad" },
};

/** "3-Pair Rotation" */
export function rotationBadge(roles: number) {
  return `${roles}-Pair Rotation`;
}
