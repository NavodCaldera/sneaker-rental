/**
 * A pair's name: its brand and model. Both are optional when listing (product owner,
 * 2026-10-12), so a pair with neither is "Unbranded shoes".
 */
export function shoeName(shoe: { brand: string; model: string }) {
  return (
    [shoe.brand, shoe.model]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ") || "Unbranded shoes"
  );
}
