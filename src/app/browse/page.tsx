import type { Metadata } from "next";
import Link from "next/link";
import { PhotoImg, WearBar } from "@/components/shoe-bits";
import { Badge, Button, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { formatLKR, formatWear } from "@/lib/format";
import { browseFacets, browseShoes } from "@/server/catalogue";
import { shoePricing } from "@/server/catalogue/pricing";

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
  const [shoes, facets] = await Promise.all([browseShoes(filters), browseFacets()]);

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
            const pricing = shoePricing(shoe);
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
                    {shoe.status === "WITH_BORROWER" && (
                      <span className="absolute left-2 top-2">
                        <Badge tone="info">Reserve next</Badge>
                      </span>
                    )}
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
                    <span className="text-subtle"> / wear-day</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-subtle">
                    <div className="w-16">
                      <WearBar wear={shoe.wear.toString()} lifespan={shoe.lifespanDays} />
                    </div>
                    {formatWear(shoe.wear.toString())} / {shoe.lifespanDays} worn
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
