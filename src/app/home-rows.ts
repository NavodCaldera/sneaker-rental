import type { D } from "@/lib/decimal";

/** What the home page knows about one listed pair, for grouping it into rows. */
export type HomeItem<C> = {
  card: C;
  status: string;
  condition: string;
  /** Price per wear-day today (after any release discount) and that discount (0 = none) */
  price: D;
  discount: D;
};

export type HomeRow<C> = { title: string; subtitle: string; items: HomeItem<C>[] };

export const ROW_SIZE = 12;

/**
 * The home page rows, in order, empty ones left out. Discounted pairs come first, biggest
 * discount first (then the lower price). `items` must be newest first.
 */
export function homeRows<C>(items: HomeItem<C>[], category?: string): HomeRow<C>[] {
  const available = items.filter((i) => i.status === "AVAILABLE");
  const where = category ? ` in ${category}` : "";
  const rows: HomeRow<C>[] = [
    {
      title: `Deals${where}: biggest discounts first`,
      subtitle: "Release discounts, kept for your whole rental",
      items: items
        .filter((i) => i.discount.gt(0))
        .sort((a, b) => b.discount.comparedTo(a.discount) || a.price.comparedTo(b.price)),
    },
    {
      title: `Just listed${where}`,
      subtitle: "Fresh pairs from our merchants, newest first",
      items: available,
    },
    {
      title: `Best value today${where}`,
      subtitle: "The lowest price per wear-day right now",
      items: [...available].sort((a, b) => a.price.comparedTo(b.price)),
    },
    {
      title: "Brand new pairs",
      subtitle: "Never worn: be the first",
      items: available.filter((i) => i.condition === "NEW"),
    },
    {
      title: "Pre-loved and upgraded",
      subtitle: "Second-hand pairs start lower on the price curve",
      items: available.filter((i) => i.condition !== "NEW"),
    },
    {
      title: "Being worn now: reserve next",
      subtitle: "Book it today and it comes straight to you when the current term ends",
      items: items.filter((i) => i.status === "WITH_BORROWER"),
    },
  ];
  return rows
    .map((row) => ({ ...row, items: row.items.slice(0, ROW_SIZE) }))
    .filter((row) => row.items.length > 0);
}
