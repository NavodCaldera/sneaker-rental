import Link from "next/link";
import { redirect } from "next/navigation";
import { type ShoeCardData, ShoeCard } from "@/components/shoe-card";
import { ShoeRow, ShoeRowItem } from "@/components/shoe-row";
import { D } from "@/lib/decimal";
import { formatDate, formatLKR, formatPercent, formatWear } from "@/lib/format";
import { conditionShort } from "@/lib/shoe-condition";
import { colomboDay, dayToDate } from "@/lib/wear-ledger";
import { getCurrentUser } from "@/server/auth/session";
import { homeFor } from "@/server/auth/service";
import { CATEGORIES, browseFacets, browseShoes } from "@/server/catalogue";
import { releaseInfo, shoePricing } from "@/server/catalogue/pricing";
import { getActiveSettings } from "@/server/settings";
import { homeRows } from "./home-rows";

/** Decorative icons for the style tabs. */
const CATEGORY_ICONS: Record<string, string> = {
  All: "👟",
  Running: "🏃",
  Lifestyle: "🕶️",
  Basketball: "🏀",
  Skate: "🛹",
  Training: "🏋️",
  Other: "✨",
};

/**
 * The marketplace home for visitors and borrowers: style tabs, a search bar and rows of pairs
 * to scroll through. Merchants and admins go to their own dashboards.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const user = await getCurrentUser();
  if (user && user.role !== "BORROWER") redirect(homeFor(user.role));

  const sp = await searchParams;
  const picked = typeof sp.category === "string" ? sp.category : undefined;
  const category = picked && CATEGORIES.includes(picked) ? picked : undefined;
  const [shoes, facets, active] = await Promise.all([
    browseShoes({ category }),
    browseFacets(),
    getActiveSettings(),
  ]);
  const today = colomboDay(new Date());

  const cards = shoes.map((shoe) => {
    const release = releaseInfo(shoe, active, today);
    const pricing = shoePricing(shoe, release.discount);
    const held = shoe.status === "WITH_BORROWER";
    const discounted = release.discount.gt(0);
    const card: ShoeCardData = {
      id: shoe.id,
      brand: shoe.brand,
      model: shoe.model,
      size: shoe.size,
      category: shoe.category,
      photoId: shoe.photos[0]?.id,
      badge: discounted
        ? `${formatPercent(release.discount)} off`
        : held
          ? "Reserve next"
          : shoe.condition !== "NEW"
            ? conditionShort(shoe.condition)
            : undefined,
      price: formatLKR(pricing.priceToday),
      priceBefore: discounted ? formatLKR(pricing.priceBeforeDiscount) : undefined,
      wear: `${formatWear(shoe.committedWear.toString())} of ${shoe.lifespanDays} wear-days used`,
      note:
        held && release.releaseDay !== null
          ? release.releaseDay < today
            ? "free now"
            : `free from ${formatDate(dayToDate(release.releaseDay + 1))}`
          : undefined,
    };
    return {
      card,
      status: shoe.status,
      condition: shoe.condition,
      price: new D(pricing.priceToday),
      discount: release.discount,
    };
  });

  const where = category ? ` in ${category}` : "";
  const seeAll = `/browse?${new URLSearchParams({ ...(category && { category }) })}`;
  const rows = homeRows(cards, category);

  return (
    <main className="flex flex-col gap-10">
      <h1 className="sr-only">Sneaker Rental: rent sneakers by the wear</h1>

      <div className="flex flex-col items-center gap-6">
        <nav aria-label="Styles" className="w-full overflow-x-auto [scrollbar-width:none]">
          <ul className="mx-auto flex w-max gap-6 px-1 sm:gap-8">
            {["All", ...CATEGORIES].map((c) => {
              const current = c === "All" ? !category : c === category;
              return (
                <li key={c}>
                  <Link
                    href={c === "All" ? "/" : `/?category=${encodeURIComponent(c)}`}
                    aria-current={current ? "page" : undefined}
                    className={`flex flex-col items-center gap-1 border-b-2 pb-2 text-sm transition ${
                      current
                        ? "border-ink font-semibold text-ink"
                        : "border-transparent text-subtle hover:border-line hover:text-ink"
                    }`}
                  >
                    <span aria-hidden="true" className="text-2xl">
                      {CATEGORY_ICONS[c] ?? "👟"}
                    </span>
                    {c}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <form
          action="/browse"
          role="search"
          aria-label="Find sneakers"
          className="flex w-full max-w-3xl items-center rounded-full border border-line bg-paper py-2 pl-2 pr-2 shadow-md"
        >
          {category && <input type="hidden" name="category" value={category} />}
          <label className="flex min-w-0 flex-1 flex-col rounded-full px-5 py-1.5 hover:bg-muted">
            <span className="text-xs font-semibold">Size</span>
            <select
              name="size"
              defaultValue=""
              className="-ml-1 bg-transparent text-sm text-subtle outline-none"
            >
              <option value="">Any size</option>
              {facets.sizes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <span aria-hidden="true" className="h-8 w-px bg-line" />
          <label className="flex min-w-0 flex-[2] flex-col rounded-full px-5 py-1.5 hover:bg-muted">
            <span className="text-xs font-semibold">Brand or model</span>
            <input
              name="q"
              placeholder="Search brands or models"
              className="bg-transparent text-sm outline-none placeholder:text-subtle"
            />
          </label>
          <button
            type="submit"
            aria-label="Search"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-white transition hover:brightness-95"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-subtle">
          No pairs{where} yet.{" "}
          <Link href="/" className="underline">
            See all styles
          </Link>
        </p>
      ) : (
        rows.map((row) => (
          <ShoeRow key={row.title} title={row.title} subtitle={row.subtitle} href={seeAll}>
            {row.items.map(({ card }) => (
              <ShoeRowItem key={card.id}>
                <ShoeCard shoe={card} />
              </ShoeRowItem>
            ))}
          </ShoeRow>
        ))
      )}

      <section
        aria-label="How it works"
        className="grid gap-6 rounded-3xl bg-muted p-6 text-sm sm:grid-cols-3 sm:p-8"
      >
        <div>
          <h2 className="mb-1 font-semibold">Pay for the wear, not the shoe</h2>
          <p className="text-subtle">
            New pairs cost more per day and worn pairs less, so the price falls as a pair ages.
          </p>
        </div>
        <div>
          <h2 className="mb-1 font-semibold">Up to four pairs at once</h2>
          <p className="text-subtle">
            Each day&apos;s wear is split across the pairs you hold, so four pairs cost about the
            same as one.
          </p>
        </div>
        <div>
          <h2 className="mb-1 font-semibold">Delivered to your door</h2>
          <p className="text-subtle">
            When you&apos;re done it goes straight to the next borrower.{" "}
            {!user && (
              <Link href="/sign-up?role=MERCHANT" className="font-medium text-ink underline">
                List your shoes
              </Link>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
