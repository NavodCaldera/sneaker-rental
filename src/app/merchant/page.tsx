import type { Metadata } from "next";
import Link from "next/link";
import { Alert, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { PhotoImg, ShoeStatusBadge, WearBar } from "@/components/shoe-bits";
import { formatLKR, formatWear } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getMerchantForUser, listMerchantShoes, merchantSummary } from "@/server/catalogue";
import { shoePricing } from "@/server/catalogue/pricing";

export const metadata: Metadata = { title: "My shoes" };

export default async function MerchantHome() {
  const user = await requireUser("MERCHANT");
  const merchant = await getMerchantForUser(user.id);
  const [shoes, summary] = await Promise.all([
    listMerchantShoes(merchant.id),
    merchantSummary(merchant.id),
  ]);
  const tiles = [
    { label: "Available", value: String(summary.available) },
    { label: "With borrowers", value: String(summary.out) },
    { label: "Cleaning", value: String(summary.cleaning) },
    { label: "Rentals closed", value: String(summary.rentalsClosed) },
    { label: "Earned", value: formatLKR(summary.earned) },
    { label: "Paid out", value: formatLKR(summary.paidOut) },
  ];

  return (
    <main>
      <PageHeader
        title="My shoes"
        description={merchant.businessName}
        actions={<LinkButton href="/merchant/shoes/new">Add shoe</LinkButton>}
      />
      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-line p-3">
            <dt className="text-xs text-subtle">{t.label}</dt>
            <dd className="mt-1 text-lg font-semibold">{t.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mb-6 flex flex-col gap-2">
        {!merchant.verified && (
          <Alert tone="info">
            Your business is awaiting verification. You can add shoes now and publish them once
            verified.
          </Alert>
        )}
        {!merchant.payoutAccount && (
          <Alert tone="info">
            <Link href="/merchant/account" className="underline">
              Add a payout account
            </Link>{" "}
            so we can pay you.
          </Alert>
        )}
      </div>

      {shoes.length === 0 ? (
        <EmptyState title="No shoes yet">
          Add your first pair: five photos, its value and how many wear-days it will last.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {shoes.map((shoe) => {
            const pricing = shoePricing(shoe);
            return (
              <li key={shoe.id}>
                <Link
                  href={`/merchant/shoes/${shoe.id}`}
                  className="flex items-center gap-4 rounded-xl border border-line p-3 hover:bg-muted/50"
                >
                  <PhotoImg
                    id={shoe.photos[0]?.id}
                    alt=""
                    className="size-16 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {shoe.brand} {shoe.model}
                      </span>
                      <span className="text-sm text-subtle">{shoe.size}</span>
                      <ShoeStatusBadge status={shoe.status} />
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-subtle">
                      <div className="w-32">
                        <WearBar wear={shoe.wear.toString()} lifespan={shoe.lifespanDays} />
                      </div>
                      {formatWear(shoe.wear.toString())} / {shoe.lifespanDays} wear-days
                    </div>
                  </div>
                  <div className="hidden text-right text-sm sm:block">
                    <div className="font-medium">{formatLKR(pricing.priceToday)}</div>
                    <div className="text-xs text-subtle">per wear-day today</div>
                  </div>
                  <div className="hidden text-right text-sm md:block">
                    <div className="font-medium">{formatLKR(shoe.collectedSoFar.toString())}</div>
                    <div className="text-xs text-subtle">collected</div>
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
