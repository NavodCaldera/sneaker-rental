import Link from "next/link";
import { ConditionBar, DiscountBadge, PhotoImg } from "./shoe-bits";
import { shoeName } from "@/lib/shoe-name";
import type { ShoeSizeDisplayInfo } from "@/lib/shoe-size";

export type ShoeCardData = {
  id: string;
  brand: string;
  model: string;
  size: string;
  sizeDetails?: ShoeSizeDisplayInfo;
  photoId?: string;
  /** Pill on the photo, e.g. "10% off", "Reserve next", "Upgraded" (only when it says something) */
  badge?: string;
  /** e.g. "90 of 365 days used" */
  wear: string;
  /** Condition percentage 0–100 */
  conditionPct?: number;
};

/**
 * A marketplace card: rounded square photo with one pill, then only the name and the
 * condition bar (product owner, 2026-10-12; the size line removed 2026-10-14). Price, experiences and dates are on the
 * listing page.
 */
export function ShoeCard({ shoe }: { shoe: ShoeCardData }) {
  const name = shoeName(shoe);
  return (
    <Link
      href={`/shoes/${shoe.id}`}
      aria-label={`${name}, ${shoe.size}`}
      className="group flex flex-col gap-2 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
    >
      <div className="relative">
        <PhotoImg
          id={shoe.photoId}
          alt=""
          className="aspect-square w-full rounded-2xl transition duration-300 group-hover:brightness-95"
        />
        {shoe.badge &&
          (shoe.badge.includes("% off") ? (
            <DiscountBadge discount={shoe.badge} className="absolute left-3 top-3" />
          ) : (
            <span className="absolute left-3 top-3 inline-flex h-6 min-w-20 items-center justify-center rounded-full bg-accent px-3 text-center text-xs font-semibold text-on-accent shadow-sm">
              {shoe.badge}
            </span>
          ))}
      </div>
      <div className="min-w-0 px-0.5 text-sm leading-snug">
        <div className="truncate font-semibold">{name}</div>
        <div className="mt-1.5">
          {shoe.conditionPct !== undefined ? (
            <ConditionBar pct={shoe.conditionPct} wear={shoe.wear} />
          ) : (
            <div className="truncate text-xs text-subtle">{shoe.wear}</div>
          )}
        </div>
      </div>
    </Link>
  );
}
