import type { Metadata } from "next";
import Link from "next/link";
import { D } from "@/lib/decimal";
import { PhotoImg } from "@/components/shoe-bits";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
} from "@/components/ui";
import { formatDate, formatLKR, formatPercent, formatTokens, formatWear } from "@/lib/format";
import { removeFromBundleAction } from "@/app/rentals/actions";
import { requireUser } from "@/server/auth/session";
import { getBundle } from "@/server/booking/bundle";
import { DEFAULT_PLANNED_DAYS, quoteBundle } from "@/server/booking/checkout";
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
                    {new D(line.discount).gt(0) && (
                      <Badge tone="good">{formatPercent(line.discount)} off this rental</Badge>
                    )}
                  </div>
                  <div className="text-sm text-subtle">
                    {line.size} · worn {formatWear(line.wear)} → {formatWear(line.wearEnd)} /{" "}
                    {line.lifespanDays} · {formatLKR(line.priceToday)} / wear-day · rent about{" "}
                    {formatLKR(line.estimate)}
                  </div>
                  <div className="text-xs text-subtle">
                    Days {formatDate(line.firstDay)} – {formatDate(line.lastDay)}
                    {line.mode === "handoff" && " (expected; starts the day after the handoff)"}
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
              <span className="text-subtle">Rental term (days)</span>
              <Input name="days" type="number" min={1} max={365} defaultValue={plannedDays} />
            </label>
            <Button type="submit" variant="secondary">
              Update
            </Button>
          </form>
          <Row label={`Rent estimate for ${plannedDays} days, locked now`}>
            {formatLKR(quote.estimate)}
          </Row>
          <Row label="Deposit: pair values, locked while you rent">
            {formatLKR(quote.shoeValue)}
          </Row>
          <Row label="Tokens needed">
            <strong>{formatTokens(quote.required)}</strong>
          </Row>
          <Row label="Your available tokens">
            <Link href="/wallet" className="underline">
              {formatTokens(quote.available ?? "0")}
            </Link>
          </Row>
          <p className="text-xs text-subtle">
            Nothing is charged now. We lock the rent estimate for the term and each pair&apos;s
            value as a deposit; when a pair is back we unlock both and charge the rent for the wear
            it actually got. Day 1 is the day after delivery. To return early, give 10 days&apos;
            notice and the estimate drops to the days you keep it; extend before the term ends to
            keep it longer. On the day after the term ends a driver collects it, and you aren&apos;t
            charged for waiting. A pair someone else is wearing comes to you right after their term;
            if they return it early we offer you the earlier dates at the new price, and if you say
            no your reservation is cancelled and your tokens unlocked. Delivery isn&apos;t paid
            through us: you pay the driver directly in the ride-hailing app when a pair is brought
            to you.
          </p>
        </Card>
        {new D(quote.shortfall).gt(0) && (
          <Card className="flex flex-col gap-2 text-sm">
            <p>
              You need <strong>{formatTokens(quote.shortfall)}</strong> more tokens to book this
              bundle.
            </p>
            <LinkButton href={`/wallet?amount=${quote.shortfall}&next=/bundle`}>
              Top up {formatTokens(quote.shortfall)}
            </LinkButton>
          </Card>
        )}
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
