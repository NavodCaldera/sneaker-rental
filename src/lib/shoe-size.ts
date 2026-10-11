import type { Audience, SizeSystem } from "@/generated/prisma/enums";

/**
 * Shoe sizes in UK, EU, US and cm (product owner, 2026-10-11). A merchant lists a pair in the
 * system on its label; we store the same size in every system from the size chart for who it's
 * for, so a borrower who thinks "UK 6" finds a pair listed as "EU 39", and every listing says
 * what its size is in the other systems. Shared by the server and client forms.
 *
 * Women's pairs use the women's chart; men's and unisex pairs the men's chart. Kids' pairs, and
 * sizes outside a chart, are shown only as listed (no kids' chart yet).
 */

/** A size borrowers can search by: a label system, or foot length in cm. */
export type SearchSystem = SizeSystem | "CM";

/** What a merchant can list in: the size on the pair's label. */
export const LISTING_SIZE_SYSTEMS: { value: SizeSystem; label: string }[] = [
  { value: "UK", label: "UK" },
  { value: "EU", label: "EU" },
  { value: "US", label: "US" },
];

export const SEARCH_SIZE_SYSTEMS: { value: SearchSystem; label: string }[] = [
  ...LISTING_SIZE_SYSTEMS,
  { value: "CM", label: "cm (foot length)" },
];

/** One size in every system. cm is foot length, heel to longest toe. */
export type SizeRow = { uk: string; eu: string; us: string; cm: string };

const row = (eu: string, uk: string, us: string, cm: string): SizeRow => ({ uk, eu, us, cm });

/** Women's size chart (product owner's chart, 2026-10-11). */
export const WOMEN_SIZES: SizeRow[] = [
  row("34", "2", "4.5", "21.5"),
  row("35", "2.5", "5", "22"),
  row("35.5", "3", "5.5", "22.5"),
  row("36", "3.5", "6", "23"),
  row("37", "4", "6.5", "23"),
  row("37.5", "4.5", "7", "23.5"),
  row("38", "5", "7.5", "24"),
  row("38.5", "5.5", "8", "24"),
  row("39", "6", "8.5", "24.5"),
  row("39.5", "6.5", "9", "25"),
  row("40", "7", "9.5", "25.5"),
  row("41", "7.5", "10", "26"),
  row("42", "8", "10.5", "26.5"),
];

/** Men's size chart, also used for unisex pairs (product owner's chart, 2026-10-11). */
export const MEN_SIZES: SizeRow[] = [
  row("38", "5", "5.5", "23.5"),
  row("38.5", "5.5", "6", "24"),
  row("39", "6", "6.5", "24.5"),
  row("40", "6.5", "7", "25"),
  row("40.5", "7", "7.5", "25.5"),
  row("41", "7.5", "8", "26"),
  row("42", "8", "8.5", "26.5"),
  row("42.5", "8.5", "9", "27"),
  row("43", "9", "9.5", "27.5"),
  row("44", "9.5", "10", "28"),
  row("44.5", "10", "10.5", "28.5"),
  row("45", "10.5", "11", "29"),
  row("46", "11", "11.5", "29.5"),
  row("46.5", "11.5", "12", "30"),
  row("47", "12", "12.5", "30.5"),
];

export type SizeChart = { name: "Women's" | "Men's"; rows: SizeRow[] };

export const SIZE_CHARTS: SizeChart[] = [
  { name: "Women's", rows: WOMEN_SIZES },
  { name: "Men's", rows: MEN_SIZES },
];

/** The chart a pair's size is converted with, or null for kids' pairs. */
export function chartFor(audience: Audience): SizeChart | null {
  if (audience === "WOMEN") return SIZE_CHARTS[0];
  if (audience === "MEN" || audience === "UNISEX") return SIZE_CHARTS[1];
  return null;
}

export const SIZE_KEY: Record<SearchSystem, keyof SizeRow> = {
  UK: "uk",
  EU: "eu",
  US: "us",
  CM: "cm",
};

/** The Shoe column holding a pair's size in each system. */
export const SIZE_COLUMN = {
  UK: "sizeUk",
  EU: "sizeEu",
  US: "sizeUs",
  CM: "sizeCm",
} as const satisfies Record<SearchSystem, string>;

/** A size number as stored and shown: "9.50" → "9.5", "06" → "6". */
export function normalizeSize(value: string) {
  return String(Number(value));
}

/** "UK 6", "EU 39", "US 8.5", "24.5 cm". */
export function formatSize(system: SearchSystem, value: string) {
  return system === "CM" ? `${value} cm` : `${system} ${value}`;
}

/** Reads a size such as "UK 6", "eu39" or "24.5 cm" (the Size filter's value). */
export function parseSize(
  text: string | undefined,
): { system: SearchSystem; value: string } | null {
  const t = text?.trim() ?? "";
  const label = /^(UK|EU|US)\s*(\d{1,2}(?:\.\d)?)$/i.exec(t);
  if (label)
    return { system: label[1].toUpperCase() as SizeSystem, value: normalizeSize(label[2]) };
  const cm = /^(\d{1,2}(?:\.\d)?)\s*cm$/i.exec(t);
  return cm ? { system: "CM", value: normalizeSize(cm[1]) } : null;
}

/** The chart row for a listed size, or null (kids' pairs, sizes outside the chart). */
export function sizeRowFor(audience: Audience, system: SizeSystem, value: string) {
  const v = normalizeSize(value);
  return chartFor(audience)?.rows.find((r) => r[SIZE_KEY[system]] === v) ?? null;
}

/**
 * The size fields stored on a shoe: its label as listed ("EU 39"), the label system, and the
 * same size in every system from the chart. Off the chart, only the listed system is filled.
 */
export function shoeSizeFields(audience: Audience, system: SizeSystem, value: string) {
  const v = normalizeSize(value);
  const r = sizeRowFor(audience, system, v);
  const pick = (s: SearchSystem) => r?.[SIZE_KEY[s]] ?? (s === system ? v : null);
  return {
    size: formatSize(system, v),
    sizeSystem: system,
    sizeUk: pick("UK"),
    sizeEu: pick("EU"),
    sizeUs: pick("US"),
    sizeCm: pick("CM"),
  };
}

/** A shoe's stored size fields (Prisma Decimals or strings). */
export type ShoeSize = {
  audience: Audience;
  sizeSystem: SizeSystem;
  sizeUk: { toString(): string } | null;
  sizeEu: { toString(): string } | null;
  sizeUs: { toString(): string } | null;
  sizeCm: { toString(): string } | null;
};

/** The pair's size in one system, or null when it isn't known in that system. */
export function sizeIn(shoe: ShoeSize, system: SearchSystem) {
  const v = shoe[SIZE_COLUMN[system]];
  return v === null ? null : formatSize(system, normalizeSize(v.toString()));
}

/**
 * The size on a card: as listed, then the same size in the borrower's system (the one they
 * searched by, else UK, or EU for a pair listed in UK), e.g. "EU 39 · UK 6".
 */
export function sizeSummary(shoe: ShoeSize, prefer?: SearchSystem) {
  const listed = sizeIn(shoe, shoe.sizeSystem)!;
  const other =
    prefer && prefer !== shoe.sizeSystem ? prefer : shoe.sizeSystem === "UK" ? "EU" : "UK";
  const also = sizeIn(shoe, other);
  return also ? `${listed} · ${also}` : listed;
}

/**
 * What a searched size is in the other systems, per chart: "UK 6" is EU 39, US 8.5 and 24.5 cm
 * on the women's chart, EU 39, US 6.5 and 24.5 cm on the men's. A cm length can match two rows.
 */
export function sizeEquivalents(system: SearchSystem, value: string) {
  const v = normalizeSize(value);
  return SIZE_CHARTS.map((chart) => ({
    chart: chart.name,
    rows: chart.rows.filter((r) => r[SIZE_KEY[system]] === v),
  })).filter((c) => c.rows.length > 0);
}

/** Every size a borrower can pick in the Size filter, smallest first. */
export function sortSizes(values: string[]) {
  return [...new Set(values.map(normalizeSize))].sort((a, b) => Number(a) - Number(b));
}
