import Link from "next/link";
import {
  SEARCH_SIZE_SYSTEMS,
  SIZE_COLUMN,
  SIZE_KEY,
  type SearchSystem,
  type ShoeSize,
  chartFor,
  formatSize,
  normalizeSize,
  parseSize,
  sizeEquivalents,
  sizeIn,
} from "@/lib/shoe-size";

/** The Size filter's options, grouped by system ("UK 6", "EU 39", "US 8.5", "24.5 cm"). */
export function SizeOptions({ sizes }: { sizes: Record<SearchSystem, string[]> }) {
  return SEARCH_SIZE_SYSTEMS.filter((s) => sizes[s.value].length > 0).map((s) => (
    <optgroup key={s.value} label={s.label}>
      {sizes[s.value].map((size) => (
        <option key={size}>{size}</option>
      ))}
    </optgroup>
  ));
}

export function sizeGuideHref(size?: string) {
  return size ? `/size-guide?size=${encodeURIComponent(size)}` : "/size-guide";
}

/**
 * What a searched size is in the other systems, on the women's and the men's chart: a borrower
 * who thinks "UK 6" sees it is EU 39, and that pairs listed as EU 39 are in the results.
 */
export function SizeEquivalence({ size }: { size: string }) {
  const parsed = parseSize(size);
  if (!parsed) return null;
  const label = formatSize(parsed.system, parsed.value);
  const charts = sizeEquivalents(parsed.system, parsed.value);
  const columns = SEARCH_SIZE_SYSTEMS.filter((s) => s.value !== parsed.system);
  return (
    <section
      aria-label="Size conversion"
      className="mb-6 rounded-2xl border border-line p-4 text-sm"
    >
      {charts.length > 0 ? (
        <>
          <h2 className="mb-2 font-semibold">{label} is the same as</h2>
          <table className="mb-2 text-left">
            <thead className="text-xs text-subtle">
              <tr>
                <th scope="col" className="pr-6 font-normal">
                  <span className="sr-only">Chart</span>
                </th>
                {columns.map((c) => (
                  <th key={c.value} scope="col" className="pr-6 font-normal">
                    {c.value === "CM" ? "cm" : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {charts.flatMap((c) =>
                c.rows.map((r) => (
                  <tr key={`${c.chart}-${r.uk}`}>
                    <th scope="row" className="pr-6 font-normal text-subtle">
                      {c.chart}
                    </th>
                    {columns.map((col) => (
                      <td key={col.value} className="pr-6 font-semibold">
                        {formatSize(col.value, r[SIZE_KEY[col.value]])}
                      </td>
                    ))}
                  </tr>
                )),
              )}
            </tbody>
          </table>
          <p className="text-subtle">
            We show every pair in this size, whichever size the merchant listed it in.{" "}
            <Link href={sizeGuideHref(label)} className="text-ink underline">
              Size guide
            </Link>
          </p>
        </>
      ) : (
        <p className="text-subtle">
          {label} isn&apos;t on our size charts, so we show pairs listed as {label}.{" "}
          <Link href={sizeGuideHref()} className="text-ink underline">
            Size guide
          </Link>
        </p>
      )}
    </section>
  );
}

/** A listing's size in every system, the one on the label marked. */
export function ShoeSizePanel({ shoe }: { shoe: ShoeSize }) {
  const chart = chartFor(shoe.audience);
  const known = SEARCH_SIZE_SYSTEMS.filter((s) => sizeIn(shoe, s.value) !== null);
  const listed = sizeIn(shoe, shoe.sizeSystem)!;
  return (
    <section aria-label="Size" className="text-sm">
      <h2 className="mb-2 font-medium">Size</h2>
      <dl className="grid grid-cols-4 gap-2">
        {known.map((s) => {
          const onLabel = s.value === shoe.sizeSystem;
          return (
            <div
              key={s.value}
              className={`rounded-xl border px-3 py-2 ${onLabel ? "border-ink" : "border-line"}`}
            >
              <dt className="text-xs text-subtle">
                {s.value === "CM" ? "cm" : s.label}
                {onLabel && <span className="sr-only"> (on the label)</span>}
              </dt>
              <dd className="font-semibold">
                {normalizeSize(shoe[SIZE_COLUMN[s.value]]!.toString())}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-2 text-subtle">
        {!chart
          ? `Kids' sizes are shown as listed: ${listed}.`
          : known.length === 1
            ? `${listed} is on the label. It isn't on our ${chart.name.toLowerCase()} chart, so we can't convert it.`
            : `${listed} is on the label (${chart.name.toLowerCase()} sizes; cm is foot length).`}{" "}
        <Link href={sizeGuideHref(listed)} className="text-ink underline">
          Size guide
        </Link>
      </p>
    </section>
  );
}
