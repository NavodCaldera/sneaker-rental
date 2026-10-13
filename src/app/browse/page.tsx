import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConditionBar, DiscountBadge, PhotoImg } from "@/components/shoe-bits";
import { ShoeSizeHover, SizeEquivalence, SizeOptions, sizeGuideHref } from "@/components/size-bits";
import { Badge, Button, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { formatLKR, formatPercent } from "@/lib/format";
import { D } from "@/lib/decimal";
import { cardPair, groupByListing, sizeRange } from "@/lib/listing";
import { conditionShort } from "@/lib/shoe-condition";
import { parseSize, shoeSizeInfo, sizeSummary } from "@/lib/shoe-size";
import { ALL_EXPERIENCES, EXPERIENCES, SHOP_AUDIENCES, parseShopAudience } from "@/lib/shoe-style";
import { colomboDay } from "@/lib/wear-ledger";
import { browseFacets, browseShoes } from "@/server/catalogue";
import { releaseInfo, shoePricing } from "@/server/catalogue/pricing";
import { getActiveSettings } from "@/server/settings";
import { shoeName } from "@/lib/shoe-name";
import { rankForPersona, shoppingProfile } from "@/lib/borrower-profile";
import { audienceLabel } from "@/lib/shoe-style";
import { colomboToday, homeFor } from "@/server/auth/service";
import { getCurrentUser } from "@/server/auth/session";
import { OCCASIONS } from "@/lib/curated-packs";

export const metadata: Metadata = { title: "Browse" };

function one(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
}

export default async function BrowsePage({ searchParams }: PageProps<"/browse">) {
  const sp = await searchParams;
  const filters = {
    size: one(sp.size),
    brand: one(sp.brand),
    audience: parseShopAudience(one(sp.for)),
    experience: one(sp.experience),
    q: one(sp.q),
  };
  // Browse is for signed-in customers (product owner, 2026-10-14): anyone else signs in first
  // and comes back; merchants and admins go to their own pages. A customer with a profile is
  // never asked who it's for or a size: they always see pairs in their size, for them, with
  // pairs made for who they want to become first. They change their size on their account page.
  const user = await getCurrentUser();
  if (!user) {
    const qs = new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
    ).toString();
    redirect(`/sign-in?next=${encodeURIComponent(qs ? `/browse?${qs}` : "/browse")}`);
  }
  if (user.role !== "BORROWER") redirect(homeFor(user.role));
  const profile = shoppingProfile(user, colomboToday());
  const personal = profile !== null;
  if (personal) {
    filters.size = profile.size;
    filters.audience = profile.audience;
  }
  const [shoes, facets, active] = await Promise.all([
    browseShoes(filters),
    browseFacets(),
    getActiveSettings(),
  ]);
  const today = colomboDay(new Date());
  // Cards show each pair's size in the system the borrower searched by, too.
  const sizeSystem = parseSize(filters.size)?.system;
  // One card per listing (product owner, 2026-10-13): its best deal among the pairs that
  // match, and the sizes they come in.
  const grouped = groupByListing(shoes).map((group) => {
    const priced = group.map((pair) => {
      const release = releaseInfo(pair, active, today);
      return { pair, release, pricing: shoePricing(pair, release.discount) };
    });
    const best = cardPair(priced, (p) => ({
      discount: p.release.discount,
      price: new D(p.pricing.priceToday),
    }));
    const prices = new Set(priced.map((p) => p.pricing.priceToday));
    return { ...best, sizes: group.map((p) => shoeSizeInfo(p).primary), from: prices.size > 1 };
  });
  const listings = rankForPersona(grouped, (l) => l.pair.experiences, profile?.becoming ?? []);

  const activeOccasion = OCCASIONS.find((o) => o.experience === filters.experience);
  const headerTitle = activeOccasion ? activeOccasion.name : "Elevate Your Everyday";

  return (
    <main>
      <PageHeader title={headerTitle} description={activeOccasion?.tagline} />

      {personal && (
        <p className="-mt-2 mb-4 text-sm text-subtle">
          Shoes in your size, {profile.size} · {audienceLabel(profile.audience)}
          {profile.becoming.length > 0 && <>, picked for who you want to become first</>}.{" "}
          <Link href="/account" className="font-medium text-ink underline">
            Change your size in your profile
          </Link>
        </p>
      )}
      {/* Demographic Tabs: All | Men | Women | Boys | Girls */}
      {!personal && (
        <nav
          aria-label="Who it's for"
          className="mb-6 w-full overflow-x-auto [scrollbar-width:none]"
        >
          <ul className="flex w-max gap-2 px-1 sm:gap-3">
            {[{ value: undefined, label: "All" }, ...SHOP_AUDIENCES].map((a) => {
              const current = a.value === filters.audience;
              const params = new URLSearchParams();
              if (a.value) params.set("for", a.value.toLowerCase());
              if (filters.experience) params.set("experience", filters.experience);
              if (filters.size) params.set("size", filters.size);
              if (filters.brand) params.set("brand", filters.brand);
              if (filters.q) params.set("q", filters.q);
              const href = params.toString() ? `/browse?${params.toString()}` : "/browse";

              return (
                <li key={a.label}>
                  <Link
                    href={href}
                    aria-current={current ? "page" : undefined}
                    className={`block rounded-full px-4 py-1.5 text-sm font-medium transition ${
                      current
                        ? "bg-ink font-semibold text-paper shadow-sm"
                        : "border border-line text-subtle hover:border-ink hover:text-ink"
                    }`}
                  >
                    {a.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {filters.experience && (
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-xs font-semibold text-ink">
            <span>Occasion: {activeOccasion?.name ?? filters.experience}</span>
            <Link
              href={`/browse?${new URLSearchParams({
                ...(filters.audience && { for: filters.audience.toLowerCase() }),
                ...(filters.size && { size: filters.size }),
                ...(filters.brand && { brand: filters.brand }),
                ...(filters.q && { q: filters.q }),
              }).toString()}`}
              className="ml-1 rounded-full p-0.5 text-subtle hover:text-ink"
              aria-label="Clear occasion filter"
            >
              ×
            </Link>
          </span>
        </div>
      )}
      <form
        // A new set of filters (e.g. "Show all shoes") resets the selects to it.
        key={JSON.stringify(filters)}
        className="mb-6 flex flex-wrap items-end gap-2"
        role="search"
      >
        <Input
          name="q"
          placeholder="Search brand or model"
          defaultValue={filters.q}
          aria-label="Search"
          className="w-full sm:w-56"
        />
        {!personal && (
          <Select name="size" defaultValue={filters.size ?? ""} aria-label="Size">
            <option value="">All sizes</option>
            <SizeOptions sizes={facets.sizes} />
            {/* A customer's own size, even when no pair is listed in it yet */}
            {filters.size && !Object.values(facets.sizes).flat().includes(filters.size) && (
              <option>{filters.size}</option>
            )}
          </Select>
        )}
        <Select name="brand" defaultValue={filters.brand ?? ""} aria-label="Brand">
          <option value="">All brands</option>
          {facets.brands.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </Select>
        {!personal && (
          <Select
            name="for"
            defaultValue={filters.audience?.toLowerCase() ?? ""}
            aria-label="Who it's for"
          >
            <option value="">Everyone</option>
            {SHOP_AUDIENCES.map((a) => (
              <option key={a.value} value={a.value.toLowerCase()}>
                {a.label}
              </option>
            ))}
          </Select>
        )}
        <Select name="experience" defaultValue={filters.experience ?? ""} aria-label="Experience">
          <option value="">All experiences</option>
          {(filters.audience ? EXPERIENCES[filters.audience] : ALL_EXPERIENCES).map((x) => (
            <option key={x}>{x}</option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {(filters.q ||
          filters.brand ||
          filters.experience ||
          (!personal && (filters.size || filters.audience))) && (
          <Link href="/browse" className="px-2 text-sm underline">
            Clear
          </Link>
        )}
        {!personal && (
          <Link href={sizeGuideHref(filters.size)} className="px-2 text-sm underline">
            Size guide
          </Link>
        )}
      </form>
      {!personal && filters.size && <SizeEquivalence size={filters.size} />}

      {listings.length === 0 ? (
        <EmptyState title="No pairs match">
          {personal
            ? "No pairs in your size match yet. Try another brand."
            : "Try another size or brand."}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {listings.map(({ pair: shoe, release, pricing, sizes, from }) => {
            const discounted = release.discount.gt(0);
            const oneSize = new Set(sizes).size === 1;
            return (
              <li key={shoe.id}>
                <Link
                  href={`/shoes/${shoe.id}`}
                  className="group flex flex-col gap-2"
                  aria-label={`${shoeName(shoe)}, ${oneSize ? sizeSummary(shoe, sizeSystem) : sizeRange(sizes)}`}
                >
                  <div className="relative">
                    <PhotoImg
                      id={shoe.photos[0]?.id}
                      alt=""
                      className="aspect-square w-full rounded-xl transition group-hover:opacity-90"
                    />
                    <span className="absolute left-2 top-2 flex flex-col items-start gap-1">
                      {shoe.status === "WITH_BORROWER" && <Badge tone="info">Reserve next</Badge>}
                      {shoe.condition !== "NEW" && <Badge>{conditionShort(shoe.condition)}</Badge>}
                      {discounted && (
                        <DiscountBadge discount={`${formatPercent(release.discount)} off`} />
                      )}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium">{shoeName(shoe)}</div>
                    <div className="text-xs text-subtle flex items-center min-w-0">
                      {oneSize ? (
                        <ShoeSizeHover
                          size={shoeSizeInfo(shoe).primary}
                          details={shoeSizeInfo(shoe)}
                        />
                      ) : (
                        <span className="truncate">{sizeRange(sizes)}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm">
                    {from && <span className="text-subtle">From </span>}
                    <span className="font-semibold">{formatLKR(pricing.priceToday)}</span>
                    {discounted && (
                      <s className="ml-1 text-xs text-subtle">
                        {formatLKR(pricing.priceBeforeDiscount)}
                      </s>
                    )}
                    <span className="text-subtle"> per day</span>
                  </div>
                  <ConditionBar wear={shoe.committedWear.toString()} lifespan={shoe.lifespanDays} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
