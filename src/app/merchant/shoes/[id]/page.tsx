import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CurveChart } from "@/components/curve-chart";
import { PhotoImg, ShoeStatusBadge, WearBar } from "@/components/shoe-bits";
import { Card, PageHeader } from "@/components/ui";
import { formatDate, formatLKR, formatWear } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { CatalogueError, getMerchantForUser, getMerchantShoe } from "@/server/catalogue";
import { shoeCurvePreview, shoePricing } from "@/server/catalogue/pricing";
import { DraftActions } from "./draft-actions";

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
  const pricing = shoePricing(shoe);
  const preview = shoeCurvePreview(shoe);

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title={`${shoe.brand} ${shoe.model}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {shoe.size} · {shoe.category} <ShoeStatusBadge status={shoe.status} />
          </span>
        }
      />

      {shoe.status === "DRAFT" && <DraftActions shoeId={shoe.id} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <h2 className="mb-3 font-medium">Price curve</h2>
          <CurveChart points={preview.points} currentWear={shoe.committedWear.toString()} />
        </Card>
        <Card className="flex flex-col gap-4 text-sm">
          <Stat label="Price today" value={`${formatLKR(pricing.priceToday)} / wear-day`} />
          <Stat
            label="New → end of life"
            value={`${formatLKR(pricing.priceNew)} → ${formatLKR(pricing.priceEnd)}`}
          />
          <div>
            <div className="mb-1 text-subtle">Wear</div>
            <WearBar wear={shoe.committedWear.toString()} lifespan={shoe.lifespanDays} />
            <div className="mt-1">
              {formatWear(shoe.committedWear.toString())} of {shoe.lifespanDays} wear-days used,
              counting current bookings
              {shoe.initialWear.gt(0) && (
                <span className="text-subtle">
                  {" "}
                  ({formatWear(shoe.initialWear.toString())} when listed)
                </span>
              )}
            </div>
          </div>
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
