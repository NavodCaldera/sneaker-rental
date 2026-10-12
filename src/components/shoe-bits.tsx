import type { ShoeStatus } from "@/generated/prisma/client";
import { Badge } from "./ui";

/* eslint-disable @next/next/no-img-element -- photos are served by our own /api/photos route */

export function PhotoImg({
  id,
  alt,
  className,
}: {
  id: string | undefined;
  alt: string;
  className?: string;
}) {
  if (!id) {
    return (
      <div
        className={`flex items-center justify-center bg-muted text-xs text-subtle ${className ?? ""}`}
      >
        No photo
      </div>
    );
  }
  return (
    <img
      src={`/api/photos/${id}`}
      alt={alt}
      className={`bg-muted object-cover ${className ?? ""}`}
      loading="lazy"
    />
  );
}

const STATUS: Record<
  ShoeStatus,
  { label: string; tone: "neutral" | "good" | "warn" | "bad" | "info" }
> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  AVAILABLE: { label: "Available", tone: "good" },
  RESERVED: { label: "Reserved", tone: "info" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", tone: "info" },
  WITH_BORROWER: { label: "With borrower", tone: "info" },
  IN_HANDOFF: { label: "In handoff", tone: "info" },
  CLEANING: { label: "Cleaning", tone: "warn" },
  RETIRED: { label: "Retired", tone: "neutral" },
  SOLD: { label: "Sold", tone: "neutral" },
};

export function ShoeStatusBadge({ status }: { status: ShoeStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function DiscountBadge({
  discount,
  className,
}: {
  discount: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-6 w-20 items-center justify-center rounded-full bg-accent text-center text-xs font-semibold text-on-accent shadow-sm ${className ?? ""}`}
    >
      {discount}
    </span>
  );
}

export function WearBar({ wear, lifespan }: { wear: string; lifespan: number }) {
  const pct = Math.min(100, (Number(wear) / lifespan) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Condition percentage (0–100) based on wear used and total lifespan */
export function conditionPercent(wear: string | number, lifespan: number): number {
  if (lifespan <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((1 - Number(wear) / lifespan) * 100)));
}

/**
 * The pair's condition as a percentage of its life left, text only (product owner,
 * 2026-10-12: no bar).
 */
export function ConditionBar({
  pct,
  wear,
  lifespan,
  label = "Condition",
}: {
  pct?: number;
  wear?: string | number;
  lifespan?: number;
  label?: string;
}) {
  const finalPct =
    pct !== undefined
      ? Math.max(0, Math.min(100, Math.round(pct)))
      : wear !== undefined && lifespan !== undefined
        ? conditionPercent(wear, lifespan)
        : 100;

  return (
    <div className="truncate text-xs font-medium text-subtle">
      {label} {finalPct}%
    </div>
  );
}
