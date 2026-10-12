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

export type HomeRow<C> = { title: string; subtitle?: string; items: HomeItem<C>[] };

export const ROW_SIZE = 12;

/**
 * The home page rows, in order, empty ones left out. Discounted pairs come first, as
 * "Exceptional Value", biggest discount first (then the lower price; product owner,
 * 2026-10-12). Just listed, Best value today, Brand new pairs and Being worn now were removed
 * from the home page at the product owner's request (2026-10-13). `items` must be newest first. `scope` names the
 * tab and experience picked, e.g. "Women · Night Out".
 */
export function homeRows<C>(
  items: HomeItem<C>[],
  scope?: string,
  /** Every pair, ignoring the tab and experience picked: Exceptional Value falls back to it */
  allItems: HomeItem<C>[] = items,
): HomeRow<C>[] {
  const available = items.filter((i) => i.status === "AVAILABLE");
  const where = scope ? ` in ${scope}` : "";
  const byDiscount = (list: HomeItem<C>[]) =>
    list
      .filter((i) => i.discount.gt(0))
      .sort((a, b) => b.discount.comparedTo(a.discount) || a.price.comparedTo(b.price));
  // Exceptional Value is always there: when nothing in the picked tab or experience is
  // discounted, it shows the discounted pairs from the whole shop (product owner, 2026-10-13).
  const here = byDiscount(items);
  const rows: HomeRow<C>[] = [
    {
      title: here.length > 0 ? `Exceptional Value${where}` : "Exceptional Value",
      subtitle: "Unmatched Value, From Day One",
      items: here.length > 0 ? here : byDiscount(allItems),
    },
    {
      title: "Pre-loved and upgraded",
      subtitle: "Second-hand pairs start lower on the price curve",
      items: available.filter((i) => i.condition !== "NEW"),
    },
  ];
  return rows
    .map((row) => ({ ...row, items: row.items.slice(0, ROW_SIZE) }))
    .filter((row) => row.items.length > 0);
}
