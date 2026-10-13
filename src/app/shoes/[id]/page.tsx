import type { Metadata } from "next";
import { BackButton } from "@/components/back-button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CurveChart } from "@/components/curve-chart";
import { PhotoImg, ShoeStatusBadge, WearBar } from "@/components/shoe-bits";
import { ShoeSizeHover, ShoeSizePanel } from "@/components/size-bits";
import { Card } from "@/components/ui";
import { D } from "@/lib/decimal";
import { formatDate, formatLKR, formatPercent, formatWear } from "@/lib/format";
import { pricingMethodLabel } from "@/lib/pricing-method";
import { shoeSizeInfo } from "@/lib/shoe-size";
import { styleLabel } from "@/lib/shoe-style";
import { conditionLabel } from "@/lib/shoe-condition";
import { colomboDay, dayToDate } from "@/lib/wear-ledger";
import { getActiveSettings } from "@/server/settings";
import { getCurrentUser } from "@/server/auth/session";
import { getListing, listingSizes } from "@/server/catalogue";
import { releaseInfo, shoeCurvePreview, shoePricing } from "@/server/catalogue/pricing";
import { getBundle } from "@/server/booking/bundle";
import { RentPanel } from "./rent-panel";
import { shoeName } from "@/lib/shoe-name";
import {
  getShoeCircularJourney,
  getShoePairingStory,
  getWearBarometerStory,
} from "@/lib/shoe-storytelling";
import { ShoeBestPaired } from "@/components/shoe-best-paired";
import { ShoeJourney } from "@/components/shoe-journey";
import { ShoeValueBarometer } from "@/components/shoe-value-barometer";

export async function generateMetadata({ params }: PageProps<"/shoes/[id]">): Promise<Metadata> {
  const shoe = await getListing((await params).id);
  return { title: shoe ? shoeName(shoe) : "Shoe" };
}

export default async function ShoePage({ params }: PageProps<"/shoes/[id]">) {
  const { id } = await params;
  const [shoe, user, bundle, active] = await Promise.all([
    getListing(id),
    getCurrentUser(),
    getBundle(),
    getActiveSettings(),
  ]);
  if (!shoe) notFound();
  const sizes = await listingSizes(shoe.listingId);
  const release = releaseInfo(shoe, active, colomboDay(new Date()));
  const pricing = shoePricing(shoe, release.discount);
  const discounted = release.discount.gt(0);
  const preview = shoeCurvePreview(shoe);
  const [main, ...rest] = shoe.photos;

  const pairingStory = getShoePairingStory(shoe);
  const journeyStory = getShoeCircularJourney(shoe);
  const discountPct = discounted ? Math.round(release.discount.times(100).toNumber()) : 0;
  const barometerStory = getWearBarometerStory(shoe.committedWear, shoe.lifespanDays, discountPct);

  return (
    <main className="flex flex-col gap-4">
      <BackButton href="/browse" to="browse" useHistory />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <PhotoImg id={main?.id} alt={shoeName(shoe)} className="aspect-[4/3] w-full rounded-2xl shadow-sm" />
          <div className="grid grid-cols-4 gap-3">
            {rest.map((p) => (
              <PhotoImg
                key={p.id}
                id={p.id}
                alt={`${p.kind.toLowerCase()} view`}
                className="aspect-square w-full rounded-xl"
              />
            ))}
          </div>

          {/* Best Paired For: Occasions, Terrain, Stylist Tip */}
          <ShoeBestPaired story={pairingStory} />

          {/* The Shoe's Journey: Circular Lifecycle */}
          <ShoeJourney journey={journeyStory} />

          <Card>
            <h2 className="mb-1 font-medium">How the price changes</h2>
            <p className="mb-3 text-sm text-subtle">
              {pricingMethodLabel(shoe.pricingMethod)}, picked by the merchant: the price per day
              falls as the pair wears. Rent is charged when you return the pair, at the price for
              its wear, and the next borrower pays less.
            </p>
            <CurveChart points={preview.points} currentWear={shoe.committedWear.toString()} />
          </Card>
        </div>

        <aside className="flex flex-col gap-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{shoeName(shoe)}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-subtle">
              <ShoeSizeHover size={shoeSizeInfo(shoe).primary} details={shoeSizeInfo(shoe)} />
              <span>
                · {styleLabel(shoe)} · {conditionLabel(shoe.condition)} ·{" "}
                {shoe.merchant.businessName}
              </span>
              <ShoeStatusBadge status={shoe.status} />
            </div>
          </div>
          <SizePicker sizes={sizes} current={shoe.id} currentSize={shoe.size} />
          <div>
            <span className="text-3xl font-bold">{formatLKR(pricing.priceToday)}</span>
            <span className="text-subtle"> per day today</span>
            {discounted && (
              <p className="mt-1 text-sm">
                <s className="text-subtle">{formatLKR(pricing.priceBeforeDiscount)}</s>{" "}
                <span className="font-medium text-good">
                  {formatPercent(release.discount)} off for your whole rental
                </span>{" "}
                if you book today
              </p>
            )}
            {shoe.status === "WITH_BORROWER" && release.releaseDay !== null && (
              <p className="mt-1 text-sm text-subtle">
                {release.releaseDay < colomboDay(new Date())
                  ? "Free now: the last borrower is keeping it for you. Book it and a driver brings it straight from them."
                  : `Booked until ${formatDate(dayToDate(release.releaseDay))}. Reserve it now and it comes to you right after, priced at the wear it will have then.`}
              </p>
            )}
          </div>

          {/* Wear-Curve Value Barometer */}
          <ShoeValueBarometer barometer={barometerStory} />
          <div className="text-sm">
            <WearBar wear={shoe.committedWear.toString()} lifespan={shoe.lifespanDays} />
            <p className="mt-1 text-subtle">
              {formatWear(shoe.committedWear.toString())} of {shoe.lifespanDays} days used
              {shoe.status === "WITH_BORROWER" && " (counting the current booking)"} ·{" "}
              {new D(pricing.lifeLeft).times(100).toFixed(0)}% of life left · grade{" "}
              {shoe.latestGrade ?? "—"}
            </p>
          </div>
          <ShoeSizePanel shoe={shoe} />
          {shoe.upgradeNotes && (
            <p className="text-sm">
              <span className="font-medium">Upgrades:</span> {shoe.upgradeNotes}
            </p>
          )}
          {shoe.description && <p className="text-sm">{shoe.description}</p>}
          <RentPanel
            shoeId={shoe.id}
            status={shoe.status}
            handoffTaken={shoe.rentalItems.length > 0}
            signedInAs={user?.role ?? null}
            inBundle={bundle.includes(shoe.id)}
          />
        </aside>
      </div>
    </main>
  );
}

/**
 * The listing's sizes (product owner, 2026-10-13): each with how many pairs are free now.
 * Picking one opens a pair of that size: each pair has its own wear and price.
 */
function SizePicker({
  sizes,
  current,
  currentSize,
}: {
  sizes: Awaited<ReturnType<typeof listingSizes>>;
  current: string;
  currentSize: string;
}) {
  if (sizes.length === 0) return null;
  return (
    <nav aria-label="Sizes" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Sizes</h2>
      <ul className="flex flex-wrap gap-2">
        {sizes.map(({ pick, available }) => {
          const here = pick.size === currentSize;
          const label = shoeSizeInfo(pick).primary;
          // Every size listed has a pair to book: free now, or reserve next while it is out.
          const note = available > 0 ? `${available} free` : "reserve next";
          return (
            <li key={pick.size}>
              <Link
                href={`/shoes/${here ? current : pick.id}`}
                aria-current={here ? "true" : undefined}
                aria-label={`${label}: ${note}`}
                className={`flex flex-col items-center rounded-xl border px-3 py-1.5 text-sm transition ${
                  here ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
                }`}
              >
                <span className="font-semibold">{label}</span>
                <span className={`text-xs ${here ? "text-paper/80" : "text-subtle"}`}>{note}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
