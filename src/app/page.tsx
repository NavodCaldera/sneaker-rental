import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IntroSplash } from "@/components/intro-splash";
import { INTRO_SEEN_COOKIE, RETURNING_COOKIE } from "@/lib/intro";
import { type ShoeCardData, ShoeCard } from "@/components/shoe-card";
import { conditionPercent } from "@/components/shoe-bits";
import { ShoeRow, ShoeRowItem } from "@/components/shoe-row";
import { OccasionDiscovery } from "@/components/occasion-discovery";
import { CuratedPacksShowcase } from "@/components/curated-packs";
import { D } from "@/lib/decimal";
import { formatLKR, formatPercent, formatWear } from "@/lib/format";
import { OccasionSearchBar, type StylistShoeItem } from "@/components/occasion-search-bar";
import { conditionShort } from "@/lib/shoe-condition";
import { cardPair, groupByListing, sizeRange } from "@/lib/listing";
import { shoeSizeInfo } from "@/lib/shoe-size";
import { ALL_EXPERIENCES, EXPERIENCES, SHOP_AUDIENCES, parseShopAudience } from "@/lib/shoe-style";
import { colomboDay } from "@/lib/wear-ledger";
import { getCurrentUser } from "@/server/auth/session";
import { homeFor } from "@/server/auth/service";
import { browseShoes } from "@/server/catalogue";
import { releaseInfo, shoePricing } from "@/server/catalogue/pricing";
import { publishedPacks } from "@/server/packs";
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

  // First-time visitors (never signed in, not yet shown this visit) get the welcome animation.
  const jar = await cookies();
  const showIntro = !user && !jar.has(RETURNING_COOKIE) && !jar.has(INTRO_SEEN_COOKIE);

  const sp = await searchParams;
  const audience = parseShopAudience(typeof sp.for === "string" ? sp.for : undefined);
  const picked = typeof sp.experience === "string" ? sp.experience : undefined;
  const experience =
    picked && (audience ? EXPERIENCES[audience].includes(picked) : ALL_EXPERIENCES.includes(picked))
      ? picked
      : undefined;
  const forParam = audience?.toLowerCase();
  const [shoes, allShoes, active, packs] = await Promise.all([
    browseShoes({ audience, experience }),
    browseShoes({}),
    getActiveSettings(),
    publishedPacks(),
  ]);
  const today = colomboDay(new Date());

  // One card per listing (product owner, 2026-10-13): it shows the listing's best deal (the
  // biggest discount, then the lowest price) and every size it has on offer.
  const cardsOf = (list: typeof shoes) =>
    groupByListing(list).map((group) => {
      const priced = group.map((pair) => {
        const release = releaseInfo(pair, active, today);
        return { pair, release, pricing: shoePricing(pair, release.discount) };
      });
      const {
        pair: shoe,
        release,
        pricing,
      } = cardPair(priced, (p) => ({
        discount: p.release.discount,
        price: new D(p.pricing.priceToday),
      }));
      const held = shoe.status === "WITH_BORROWER";
      const discounted = release.discount.gt(0);
      const sizes = group.map((p) => shoeSizeInfo(p).primary);
      const oneSize = new Set(sizes).size === 1;
      const sizeDetails = shoeSizeInfo(shoe);
      const card: ShoeCardData = {
        id: shoe.id,
        brand: shoe.brand,
        model: shoe.model,
        size: oneSize ? sizeDetails.primary : sizeRange(sizes),
        sizeDetails: oneSize ? sizeDetails : undefined,
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

  const stylistShoes: StylistShoeItem[] = allShoes.map((shoe) => {
    const release = releaseInfo(shoe, active, today);
    const pricing = shoePricing(shoe, release.discount);
    return {
      id: shoe.id,
      brand: shoe.brand,
      model: shoe.model,
      experiences: shoe.experiences,
      priceToday: formatLKR(pricing.priceToday),
      photoId: shoe.photos[0]?.id,
      condition: conditionShort(shoe.condition),
    };
  });

  return (
    <main className="flex flex-col gap-10">
      {showIntro && <IntroSplash />}
      <h1 className="sr-only">Nova: rent shoes by the day</h1>

      <div className="flex flex-col items-center gap-6">
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

        <OccasionSearchBar shoes={stylistShoes} />
      </div>

      <OccasionDiscovery currentExperience={experience} audienceParam={forParam} />

      <CuratedPacksShowcase packs={packs} />

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
    </main>
  );
}
