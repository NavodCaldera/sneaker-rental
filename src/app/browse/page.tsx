import type { Metadata } from "next";
import Link from "next/link";
import { PhotoImg, WearBar } from "@/components/shoe-bits";
import { Badge, Button, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { formatDate, formatLKR, formatPercent, formatWear } from "@/lib/format";
import { colomboDay, dayToDate } from "@/lib/wear-ledger";
import { browseFacets, browseShoes } from "@/server/catalogue";
import { releaseInfo, shoePricing } from "@/server/catalogue/pricing";
import { getActiveSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Browse" };

function one(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
}

export default async function BrowsePage({ searchParams }: PageProps<"/browse">) {
  const sp = await searchParams;
  const filters = {
    size: one(sp.size),
    brand: one(sp.brand),
    category: one(sp.category),
    q: one(sp.q),
  };
  const [shoes, facets, active] = await Promise.all([
    browseShoes(filters),
    browseFacets(),
    getActiveSettings(),
  ]);
  const today = colomboDay(new Date());

  return (
    <main>
      <PageHeader
        title="Browse sneakers"
        description="Prices are per wear-day and fall as a pair ages. Hold up to four pairs and the wear is split between them."
      />
      <form className="mb-6 flex flex-wrap items-end gap-2" role="search">
        <Input
          name="q"
          placeholder="Search brand or model"
          defaultValue={filters.q}
          aria-label="Search"
          className="w-full sm:w-56"
        />
        <Select name="size" defaultValue={filters.size ?? ""} aria-label="Size">
          <option value="">All sizes</option>
          {facets.sizes.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select name="brand" defaultValue={filters.brand ?? ""} aria-label="Brand">
          <option value="">All brands</option>
          {facets.brands.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </Select>
        <Select name="category" defaultValue={filters.category ?? ""} aria-label="Style">
          <option value="">All styles</option>
          {facets.categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {(filters.q || filters.size || filters.brand || filters.category) && (
          <Link href="/browse" className="px-2 text-sm underline">
            Clear
          </Link>
        )}
      </form>

      {shoes.length === 0 ? (
        <EmptyState title="No pairs match">Try another size or brand.</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {shoes.map((shoe) => {
            const release = releaseInfo(shoe, active, today);
            const pricing = shoePricing(shoe, release.discount);
            const discounted = release.discount.gt(0);
            return (
              <li key={shoe.id}>
                <Link
                  href={`/shoes/${shoe.id}`}
                  className="group flex flex-col gap-2"
                  aria-label={`${shoe.brand} ${shoe.model}, ${shoe.size}`}
                >
                  <div className="relative">
                    <PhotoImg
                      id={shoe.photos[0]?.id}
                      alt=""
                      className="aspect-square w-full rounded-xl transition group-hover:opacity-90"
                    />
                    <span className="absolute left-2 top-2 flex flex-col items-start gap-1">
                      {shoe.status === "WITH_BORROWER" && <Badge tone="info">Reserve next</Badge>}
                      {discounted && (
                        <Badge tone="good">{formatPercent(release.discount)} off</Badge>
                      )}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {shoe.brand} {shoe.model}
                    </div>
                    <div className="text-xs text-subtle">
                      {shoe.size} · {shoe.category}
                    </div>
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold">{formatLKR(pricing.priceToday)}</span>
                    {discounted && (
                      <s className="ml-1 text-xs text-subtle">
                        {formatLKR(pricing.priceBeforeDiscount)}
                      </s>
                    )}
                    <span className="text-subtle"> / wear-day</span>
                  </div>
                  {shoe.status === "WITH_BORROWER" && release.releaseDay !== null && (
                    <div className="text-xs text-subtle">
                      {release.releaseDay < today
                        ? "Free now"
                        : `Free from ${formatDate(dayToDate(release.releaseDay))}`}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-subtle">
                    <div className="w-16">
                      <WearBar wear={shoe.committedWear.toString()} lifespan={shoe.lifespanDays} />
                    </div>
                    {formatWear(shoe.committedWear.toString())} / {shoe.lifespanDays} used
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
