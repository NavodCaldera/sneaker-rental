import type { Metadata } from "next";
import { BackButton } from "@/components/back-button";
import { pricingMethodLabel } from "@/lib/pricing-method";
import { conditionLabel } from "@/lib/shoe-condition";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ShoeStatus } from "@/generated/prisma/enums";
import { CurveChart } from "@/components/curve-chart";
import { PhotoImg, ShoeStatusBadge, WearBar } from "@/components/shoe-bits";
import { ShoeSizeHover } from "@/components/size-bits";
import { Card, PageHeader } from "@/components/ui";
import { toD } from "@/lib/decimal";
import { formatDate, formatLKR, formatWear } from "@/lib/format";
import { shoeSizeInfo } from "@/lib/shoe-size";
import { styleLabel } from "@/lib/shoe-style";
import { requireUser } from "@/server/auth/session";
import {
  CatalogueError,
  getMerchantForUser,
  getMerchantShoe,
  listingStock,
} from "@/server/catalogue";
import { shoeCurvePreview, shoePricing } from "@/server/catalogue/pricing";
import { getActiveSettings } from "@/server/settings";
import { DraftActions } from "./draft-actions";
import { PricingMethodForm } from "./pricing-method-form";
import { StyleForm } from "./style-form";
import { shoeName } from "@/lib/shoe-name";

export const metadata: Metadata = { title: "Shoe" };

export default async function MerchantShoePage({ params }: PageProps<"/merchant/shoes/[id]">) {
  const { id } = await params;
  const user = await requireUser("MERCHANT");
  const merchant = await getMerchantForUser(user.id);
  const shoe = await getMerchantShoe(merchant.id, id).catch((e) => {
    if (e instanceof CatalogueError) notFound();
    throw e;
  });
  const now = new Date();
  const stock = await listingStock(merchant.id, shoe.listingId);
  const pricing = shoePricing(shoe);
  const preview = shoeCurvePreview(shoe);
  // A draft's method can still change; the hint quotes the floor new listings get.
  const floorPercent =
    shoe.status === "DRAFT"
      ? toD((await getActiveSettings()).floor)
          .times(100)
          .toString()
      : "";

  return (
    <main className="flex flex-col gap-6">
      <BackButton href="/merchant" to="my shoes" />
      <PageHeader
        title={shoeName(shoe)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ShoeSizeHover size={shoeSizeInfo(shoe).primary} details={shoeSizeInfo(shoe)} />
            <span>· {styleLabel(shoe)}</span>
            <ShoeStatusBadge status={shoe.status} />
          </span>
        }
      />

      {shoe.status === "DRAFT" && <DraftActions shoeId={shoe.id} />}

      <StockCard stock={stock} current={shoe.id} />
      {shoe.status === "DRAFT" && (
        <PricingMethodForm
          shoeId={shoe.id}
          method={shoe.pricingMethod}
          floorPercent={floorPercent}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <h2 className="font-medium">Price curve</h2>
          <p className="mb-3 text-sm text-subtle">{pricingMethodLabel(shoe.pricingMethod)}</p>
          <CurveChart points={preview.points} currentWear={shoe.committedWear.toString()} />
        </Card>
        <Card className="flex flex-col gap-4 text-sm">
          <Stat label="Price today" value={`${formatLKR(pricing.priceToday)} per day`} />
          <Stat
            label="New → end of life"
            value={`${formatLKR(pricing.priceNew)} → ${formatLKR(pricing.priceEnd)}`}
          />
          <div>
            <div className="mb-1 text-subtle">Wear</div>
            <WearBar wear={shoe.committedWear.toString()} lifespan={shoe.lifespanDays} />
            <div className="mt-1">
              {formatWear(shoe.committedWear.toString())} of {shoe.lifespanDays} days used, counting
              current bookings
              {shoe.initialWear.gt(0) && (
                <span className="text-subtle">
                  {" "}
                  ({formatWear(shoe.initialWear.toString())} when listed)
                </span>
              )}
            </div>
          </div>
          <Stat
            label="Condition when listed"
            value={
              shoe.upgradeNotes
                ? `${conditionLabel(shoe.condition)}: ${shoe.upgradeNotes}`
                : conditionLabel(shoe.condition)
            }
          />
          <Stat label="Declared value" value={formatLKR(shoe.value.toString())} />
          <Stat label="Lifetime income target (R)" value={formatLKR(pricing.lifetimeIncome)} />
          <Stat label="You earn over its life" value={formatLKR(pricing.merchantTarget)} />
          <Stat
            label="Paid to you so far (you're paid first)"
            value={`${formatLKR(pricing.merchantCollected)} of ${formatLKR(pricing.merchantTarget)}`}
          />
          <Stat label="Collected so far" value={formatLKR(shoe.collectedSoFar.toString())} />
          <Stat label="Lost to discounts" value={formatLKR(shoe.lostToDiscounts.toString())} />
        </Card>
      </div>

      <StyleForm shoeId={shoe.id} audience={shoe.audience} experiences={shoe.experiences} />

      <Card>
        <h2 className="mb-3 font-medium">Photos</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {shoe.photos
            .filter((p) => ["FRONT", "SIDE", "SOLE", "INSIDE", "BOX"].includes(p.kind))
            .map((p) => (
              <figure key={p.id}>
                <PhotoImg
                  id={p.id}
                  alt={`${p.kind.toLowerCase()} view`}
                  className="aspect-square w-full rounded-lg"
                />
                <figcaption className="mt-1 text-xs capitalize text-subtle">
                  {p.kind.toLowerCase()}
                </figcaption>
              </figure>
            ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-medium">Rental history</h2>
        {shoe.rentalItems.length === 0 ? (
          <p className="text-sm text-subtle">No rentals yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-subtle">
                <tr>
                  <th className="py-2 font-medium">Borrower</th>
                  <th className="py-2 font-medium">From</th>
                  <th className="py-2 font-medium">To</th>
                  <th className="py-2 font-medium">Wear</th>
                  <th className="py-2 text-right font-medium">Your share</th>
                </tr>
              </thead>
              <tbody>
                {shoe.rentalItems.map((item) => (
                  <tr key={item.id} className="border-t border-line">
                    <td className="py-2">{item.rental.borrower.name}</td>
                    <td className="py-2">{formatDate(item.startDate)}</td>
                    <td className="py-2">
                      {item.endDate
                        ? formatDate(item.endDate)
                        : item.status.toLowerCase().replace("_", " ")}
                    </td>
                    <td className="py-2">
                      {item.wearStart && item.wearEnd
                        ? `${formatWear(item.wearStart.toString())} → ${formatWear(item.wearEnd.toString())}`
                        : "—"}
                    </td>
                    <td className="py-2 text-right">
                      {item.merchantShare ? formatLKR(item.merchantShare.toString()) : "—"}
                      {item.payableAt && item.payableAt > now && !item.payoutId && (
                        <Link
                          href={`/disputes/new?item=${item.id}`}
                          className="ml-2 text-xs underline"
                        >
                          Dispute
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-subtle">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

const STATUS_WORDS: Record<ShoeStatus, string> = {
  DRAFT: "draft",
  AVAILABLE: "available",
  RESERVED: "booked",
  OUT_FOR_DELIVERY: "on its way",
  WITH_BORROWER: "with a borrower",
  IN_HANDOFF: "in handoff",
  CLEANING: "cleaning",
  RETIRED: "retired",
  SOLD: "sold",
};

/**
 * The listing's stock (product owner, 2026-10-13): how many pairs it has of each size, and
 * where each pair is. Each pair has its own page, wear and price.
 */
function StockCard({
  stock,
  current,
}: {
  stock: Awaited<ReturnType<typeof listingStock>>;
  current: string;
}) {
  const bySize = new Map<string, typeof stock>();
  for (const p of stock) bySize.set(p.size, [...(bySize.get(p.size) ?? []), p]);
  const sizes = [...bySize.entries()].sort(
    ([a], [b]) => Number(a.split(" ")[1]) - Number(b.split(" ")[1]),
  );
  return (
    <Card>
      <h2 className="font-medium">Pairs in this listing</h2>
      <p className="mb-3 text-sm text-subtle">
        {stock.length} {stock.length === 1 ? "pair" : "pairs"} in {sizes.length}{" "}
        {sizes.length === 1 ? "size" : "sizes"}. Each pair is rented, worn and priced on its own.
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        {sizes.map(([size, pairs]) => (
          <li key={size} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="w-24 font-semibold">
              {size} × {pairs.length}
            </span>
            {pairs.map((p, i) =>
              p.id === current ? (
                <span key={p.id} aria-current="page" className="font-medium">
                  Pair {i + 1} (this one): {STATUS_WORDS[p.status]}
                </span>
              ) : (
                <Link key={p.id} href={`/merchant/shoes/${p.id}`} className="underline">
                  Pair {i + 1}: {STATUS_WORDS[p.status]}
                </Link>
              ),
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
