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

export function WearBar({ wear, lifespan }: { wear: string; lifespan: number }) {
  const pct = Math.min(100, (Number(wear) / lifespan) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className="h-full rounded-full bg-ink/60" style={{ width: `${pct}%` }} />
    </div>
  );
}
