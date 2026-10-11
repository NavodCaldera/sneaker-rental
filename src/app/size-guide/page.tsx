import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import {
  SEARCH_SIZE_SYSTEMS,
  SIZE_CHARTS,
  SIZE_KEY,
  type SizeRow,
  formatSize,
  parseSize,
} from "@/lib/shoe-size";
import { getActiveSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Size guide" };

/**
 * The women's and men's size charts (UK, EU, US, cm), with the borrower's size highlighted
 * when they come from a search or a listing (`?size=UK 6`).
 */
export default async function SizeGuidePage({ searchParams }: PageProps<"/size-guide">) {
  const [sp, settings] = await Promise.all([searchParams, getActiveSettings()]);
  const size = parseSize(typeof sp.size === "string" ? sp.size : undefined);
  const matches = (r: SizeRow) => !!size && r[SIZE_KEY[size.system]] === size.value;
  const label = size && formatSize(size.system, size.value);

  return (
    <main className="max-w-3xl">
      <PageHeader
        title="Size guide"
        description="Merchants list each pair in the size on its label: UK, EU or US. Every listing shows the same size in the other systems, and searching by any of them finds it."
      />
      {label && (
        <p className="mb-6 text-sm">
          {SIZE_CHARTS.some((c) => c.rows.some(matches)) ? (
            <>
              <span className="font-semibold">{label}</span> is highlighted below.
            </>
          ) : (
            <>
              <span className="font-semibold">{label}</span> isn&apos;t on these charts.
            </>
          )}{" "}
          <Link href={`/browse?size=${encodeURIComponent(label)}`} className="underline">
            See pairs in {label}
          </Link>
        </p>
      )}
      <div className="grid gap-8 sm:grid-cols-2">
        {SIZE_CHARTS.map((chart) => (
          <section key={chart.name}>
            <h2 className="mb-2 font-semibold">
              {chart.name === "Men's" ? "Men's and unisex" : chart.name}
            </h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-subtle">
                  {SEARCH_SIZE_SYSTEMS.map((s) => (
                    <th key={s.value} scope="col" className="py-2 pr-3 font-normal">
                      {s.value === "CM" ? "cm" : s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chart.rows.map((r) => {
                  const hit = matches(r);
                  return (
                    <tr
                      key={r.uk}
                      aria-current={hit ? "true" : undefined}
                      className={`border-b border-line ${hit ? "bg-accent font-semibold text-on-accent" : ""}`}
                    >
                      {SEARCH_SIZE_SYSTEMS.map((s) => (
                        <td key={s.value} className="py-1.5 pl-1 pr-3">
                          {r[SIZE_KEY[s.value]]}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <div className="mt-8 flex flex-col gap-2 text-sm text-subtle">
        <p>
          <span className="font-medium text-ink">Between sizes?</span> Measure your foot from heel
          to longest toe, standing, and use the cm column.
        </p>
        <p>
          <span className="font-medium text-ink">Unisex pairs</span> use the men&apos;s chart.{" "}
          <span className="font-medium text-ink">Kids&apos; pairs</span> are shown in the size on
          their label.
        </p>
        <p>
          <span className="font-medium text-ink">Wrong fit?</span> You can end a pair&apos;s rental
          at once within {settings.freeReturnHours} hours of delivery, without the usual notice.
        </p>
      </div>
    </main>
  );
}
