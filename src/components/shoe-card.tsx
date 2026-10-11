import Link from "next/link";
import { PhotoImg } from "./shoe-bits";
import { shoeName } from "@/lib/shoe-name";

export type ShoeCardData = {
  id: string;
  brand: string;
  model: string;
  size: string;
  /** Who it's for and the experience, e.g. "Women · Night Out" */
  style: string;
  photoId?: string;
  /** Pill on the photo, e.g. "10% off", "Reserve next", "Upgraded" (only when it says something) */
  badge?: string;
  /** Formatted price per wear-day today, and the struck-through one before a discount */
  price: string;
  priceBefore?: string;
  /** e.g. "90 of 365 wear-days used" */
  wear: string;
  /** e.g. "Free from 12 Jan" for a pair someone is wearing */
  note?: string;
};

/** A marketplace card: rounded square photo with one pill, then name, details and price. */
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
        {shoe.badge && (
          <span className="absolute left-3 top-3 rounded-full bg-paper/95 px-3 py-1 text-xs font-semibold text-ink shadow-sm">
            {shoe.badge}
          </span>
        )}
      </div>
      <div className="min-w-0 px-0.5 text-sm leading-snug">
        <div className="truncate font-semibold">{name}</div>
        <div className="truncate text-subtle">
          {shoe.size} · {shoe.style}
          {shoe.note && <> · {shoe.note}</>}
        </div>
        <div className="mt-1 truncate">
          <span className="font-semibold">{shoe.price}</span>
          {shoe.priceBefore && <s className="ml-1 text-subtle">{shoe.priceBefore}</s>}
          <span className="text-subtle"> per day</span>
        </div>
        <div className="truncate text-xs text-subtle">{shoe.wear}</div>
      </div>
    </Link>
  );
}
