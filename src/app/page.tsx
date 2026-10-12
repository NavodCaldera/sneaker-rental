import Link from "next/link";
import { redirect } from "next/navigation";
import { type ShoeCardData, ShoeCard } from "@/components/shoe-card";
import { conditionPercent } from "@/components/shoe-bits";
import { ShoeRow, ShoeRowItem } from "@/components/shoe-row";
import { SearchBox } from "@/components/search-box";
import { SizeOptions } from "@/components/size-bits";
import { OccasionDiscovery } from "@/components/occasion-discovery";
import { CuratedPacksShowcase } from "@/components/curated-packs";
import { D } from "@/lib/decimal";
import { formatPercent, formatWear } from "@/lib/format";
import { conditionShort } from "@/lib/shoe-condition";
import { shoeSizeInfo } from "@/lib/shoe-size";
import { ALL_EXPERIENCES, EXPERIENCES, SHOP_AUDIENCES, parseShopAudience } from "@/lib/shoe-style";
import { colomboDay } from "@/lib/wear-ledger";
import { getCurrentUser } from "@/server/auth/session";
import { homeFor } from "@/server/auth/service";
import { browseFacets, browseShoes } from "@/server/catalogue";
import { releaseInfo, shoePricing } from "@/server/catalogue/pricing";
import { getActiveSettings } from "@/server/settings";
import { homeRows } from "./home-rows";

/** A home-page link that keeps only the given shopping filters. */
function homeHref(params: { for?: string; experience?: string }) {
  const qs = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => !!e[1]),
  ).toString();
  return qs ? `/?${qs}` : "/";
}

/**
 * The marketplace home for visitors and borrowers: tabs for who it's for (Men, Women, Boys,
 * Girls), that audience's experiences as chips, a search bar and rows of pairs to scroll
 * through. Merchants and admins go to their own dashboards.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const user = await getCurrentUser();
  if (user && user.role !== "BORROWER") redirect(homeFor(user.role));

  const sp = await searchParams;
  const audience = parseShopAudience(typeof sp.for === "string" ? sp.for : undefined);
  const picked = typeof sp.experience === "string" ? sp.experience : undefined;
  const experience =
    picked && (audience ? EXPERIENCES[audience].includes(picked) : ALL_EXPERIENCES.includes(picked))
      ? picked
      : undefined;
  const forParam = audience?.toLowerCase();
  const [shoes, allShoes, facets, active] = await Promise.all([
    browseShoes({ audience, experience }),
    browseShoes({}),
    browseFacets(),
    getActiveSettings(),
  ]);
  const today = colomboDay(new Date());

  const cardsOf = (list: typeof shoes) =>
    list.map((shoe) => {
      const release = releaseInfo(shoe, active, today);
      const pricing = shoePricing(shoe, release.discount);
      const held = shoe.status === "WITH_BORROWER";
      const discounted = release.discount.gt(0);
      const sizeDetails = shoeSizeInfo(shoe);
      const card: ShoeCardData = {
        id: shoe.id,
        brand: shoe.brand,
        model: shoe.model,
        size: sizeDetails.primary,
        sizeDetails,
        photoId: shoe.photos[0]?.id,
        badge: discounted
          ? `${formatPercent(release.discount)} off`
          : held
            ? "Reserve next"
            : shoe.condition !== "NEW"
              ? conditionShort(shoe.condition)
              : undefined,
        wear: `${formatWear(shoe.committedWear.toString())} of ${shoe.lifespanDays} days used`,
        conditionPct: conditionPercent(shoe.committedWear.toString(), shoe.lifespanDays),
      };
      return {
        card,
        status: shoe.status,
        condition: shoe.condition,
        price: new D(pricing.priceToday),
        discount: release.discount,
      };
    });
  const cards = cardsOf(shoes);

  const audienceName = SHOP_AUDIENCES.find((a) => a.value === audience)?.label;
  const scope = audienceName
    ? experience
      ? `${audienceName} · ${experience}`
      : audienceName
    : experience;
  const where = scope ? ` in ${scope}` : "";
  const seeAll = `/browse?${new URLSearchParams({
    ...(forParam && { for: forParam }),
    ...(experience && { experience }),
  })}`;
  // Exceptional Value shows the whole shop's discounted pairs if this tab has none.
  const rows = homeRows(cards, scope, cardsOf(allShoes));

  return (
    <main className="flex flex-col gap-10">
      <h1 className="sr-only">Nova: rent shoes by the day</h1>

      <div className="flex flex-col items-center gap-6">
        <nav aria-label="Who it's for" className="w-full overflow-x-auto [scrollbar-width:none]">
          <ul className="mx-auto flex w-max gap-6 px-1 sm:gap-10">
            {[{ value: undefined, label: "All" }, ...SHOP_AUDIENCES].map((a) => {
              const current = a.value === audience;
              return (
                <li key={a.label}>
                  <Link
                    href={homeHref({ for: a.value?.toLowerCase() })}
                    aria-current={current ? "page" : undefined}
                    className={`block border-b-2 pb-2 text-sm transition ${
                      current
                        ? "border-ink font-semibold text-ink"
                        : "border-transparent text-subtle hover:border-line hover:text-ink"
                    }`}
                  >
                    {a.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {audience && (
          <nav
            aria-label={`Experiences for ${audienceName}`}
            className="-mt-2 w-full overflow-x-auto [scrollbar-width:none]"
          >
            <ul className="mx-auto flex w-max gap-2 px-1">
              {[undefined, ...EXPERIENCES[audience]].map((x) => {
                const current = x === experience;
                return (
                  <li key={x ?? "all"}>
                    <Link
                      href={homeHref({ for: forParam, experience: x })}
                      aria-current={current ? "page" : undefined}
                      className={`block whitespace-nowrap rounded-full border px-4 py-2 text-sm transition ${
                        current
                          ? "border-ink bg-ink font-semibold text-paper"
                          : "border-line text-ink hover:border-ink"
                      }`}
                    >
                      {x ?? `All ${audienceName}`}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <form
          action="/browse"
          role="search"
          aria-label="Find shoes"
          className="relative flex w-full max-w-3xl items-center rounded-full border border-line bg-paper py-2 pl-2 pr-2 shadow-md"
        >
          {forParam && <input type="hidden" name="for" value={forParam} />}
          {experience && <input type="hidden" name="experience" value={experience} />}
          <label className="flex min-w-0 flex-1 cursor-pointer flex-col justify-center rounded-full px-5 py-1.5 hover:bg-muted">
            <span className="text-xs font-semibold">Size</span>
            <select
              name="size"
              defaultValue=""
              className="-ml-1 w-full cursor-pointer bg-transparent text-sm text-subtle outline-none"
            >
              <option value="">Any size</option>
              <SizeOptions sizes={facets.sizes} />
            </select>
          </label>
          <span aria-hidden="true" className="h-8 w-px bg-line" />
          <SearchBox />
          <button
            type="submit"
            aria-label="Search"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition hover:brightness-95"
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

      <OccasionDiscovery currentExperience={experience} audienceParam={forParam} />

      <CuratedPacksShowcase />

      {rows.length === 0 ? (
        <p className="py-16 text-center text-subtle">
          No discounted pairs{where} right now.{" "}
          <Link href={seeAll} className="underline">
            Browse all shoes
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
          <h2 className="mb-1 font-semibold">Hold any number of pairs</h2>
          <p className="text-subtle">
            Each day&apos;s wear is split across all pairs you hold, so renting multiple pairs costs
            about the same as one.
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
