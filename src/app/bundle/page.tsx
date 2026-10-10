import type { Metadata } from "next";
import Link from "next/link";
import { PhotoImg } from "@/components/shoe-bits";
import { Alert, Badge, Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { formatLKR, formatWear } from "@/lib/format";
import { removeFromBundleAction } from "@/app/rentals/actions";
import { requireUser } from "@/server/auth/session";
import { getBundle } from "@/server/booking/bundle";
import { DEFAULT_PLANNED_DAYS, quoteBundle } from "@/server/booking/checkout";
import { gateway } from "@/server/payments/gateway";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Bundle" };

export default async function BundlePage({ searchParams }: PageProps<"/bundle">) {
  const user = await requireUser("BORROWER");
  const { days } = await searchParams;
  const plannedDays = Math.min(365, Math.max(1, Number(days) || DEFAULT_PLANNED_DAYS));
  const ids = await getBundle();
  const quote = await quoteBundle(user.id, ids, plannedDays);

  if (quote.lines.length === 0) {
    return (
      <main>
        <PageHeader title="Your bundle" />
        <EmptyState title="Your bundle is empty">
          <Link href="/browse" className="underline">
            Browse sneakers
          </Link>{" "}
          and add up to {quote.maxPairs} pairs.
        </EmptyState>
      </main>
    );
  }

  return (
    <main className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <PageHeader
          title="Your bundle"
          description={`Hold up to ${quote.maxPairs} pairs at once. Each day's wear is split across the pairs you hold, so a full bundle costs about one pair's daily price.`}
        />
        <ul className="flex flex-col gap-3">
          {quote.lines.map((line) => (
            <li key={line.shoeId}>
              <Card className="flex items-center gap-4 p-3">
                <PhotoImg id={line.photoId} alt="" className="size-16 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    <Link href={`/shoes/${line.shoeId}`} className="hover:underline">
                      {line.brand} {line.model}
                    </Link>
                    {line.mode === "handoff" && <Badge tone="info">Reserved next · handoff</Badge>}
                  </div>
                  <div className="text-sm text-subtle">
                    {line.size} · worn {formatWear(line.wear)} / {line.lifespanDays} ·{" "}
                    {formatLKR(line.priceToday)} / wear-day
                  </div>
                  {line.problem && <p className="mt-1 text-sm text-danger">{line.problem}</p>}
                </div>
                <form action={removeFromBundleAction.bind(null, line.shoeId)}>
                  <Button
                    type="submit"
                    variant="ghost"
                    aria-label={`Remove ${line.brand} ${line.model}`}
                  >
                    Remove
                  </Button>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      </div>

      <aside className="flex flex-col gap-4 lg:pt-14">
        <Card className="flex flex-col gap-3 text-sm">
          <Row
            label={`Daily cost (${quote.totalPairs} pair${quote.totalPairs > 1 ? "s" : ""} held)`}
          >
            {formatLKR(quote.dailyCost)} / day
          </Row>
          <form className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-subtle">Planned days</span>
              <Input name="days" type="number" min={1} max={365} defaultValue={plannedDays} />
            </label>
            <Button type="submit" variant="secondary">
              Update
            </Button>
          </form>
          <Row label={`Estimate for ${plannedDays} days`}>{formatLKR(quote.estimate)}</Row>
          <Row label="Deposit hold">{formatLKR(quote.deposit)}</Row>
          <p className="text-xs text-subtle">
            We pre-authorise the estimate and hold the deposit on your card. You&apos;re charged for
            the wear you actually add when each pair is returned, and the deposit is released once
            its condition is checked. Delivery fees are quoted by the ride-hailing app.
            {gateway().name === "mock" && " Test mode: no real card is charged."}
          </p>
        </Card>
        {quote.problems.length > 0 ? (
          <Alert>{quote.problems[0]}</Alert>
        ) : (
          <Card>
            <CheckoutForm plannedDays={plannedDays} />
          </Card>
        )}
      </aside>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-subtle">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
