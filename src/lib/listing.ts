import type { D } from "./decimal";

/**
 * Listings (product owner, 2026-10-13): a merchant lists a shoe once with how many pairs they
 * have in each size, and every pair is its own Shoe row sharing a `listingId`. Borrowers see one
 * card per listing; these helpers group the pairs and pick the one a card shows.
 */

/** Pairs grouped by listing, each listing where its first pair came in `pairs`. */
export function groupByListing<T extends { listingId: string }>(pairs: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const pair of pairs) {
    const group = groups.get(pair.listingId);
    if (group) group.push(pair);
    else groups.set(pair.listingId, [pair]);
  }
  return [...groups.values()];
}

/**
 * The pair a listing's card shows: the biggest discount first, then the lowest price today.
 */
export function cardPair<T>(group: T[], score: (pair: T) => { discount: D; price: D }): T {
  return group
    .map((pair) => ({ pair, s: score(pair) }))
    .sort((a, b) => b.s.discount.comparedTo(a.s.discount) || a.s.price.comparedTo(b.s.price))[0]
    .pair;
}

/**
 * A listing's sizes on a card, smallest first: "UK 9", or "UK 7, 8, 9" when they share a
 * system, else each label ("UK 3, EU 38").
 */
export function sizeRange(labels: string[]): string {
  const unique = [...new Set(labels)];
  if (unique.length <= 1) return unique[0] ?? "";
  const parsed = unique.map((l) => /^(UK|EU|US) (\d+(?:\.\d+)?)$/.exec(l));
  const system = parsed[0]?.[1];
  if (system && parsed.every((m) => m && m[1] === system)) {
    const numbers = parsed.map((m) => m![2]).sort((a, b) => Number(a) - Number(b));
    return `${system} ${numbers.join(", ")}`;
  }
  const number = (l: string) => Number(/(\d+(?:\.\d+)?)/.exec(l)?.[1] ?? 0);
  return [...unique].sort((a, b) => number(a) - number(b)).join(", ");
}
