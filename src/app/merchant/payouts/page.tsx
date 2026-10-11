import type { Metadata } from "next";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatLKR } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getMerchantForUser } from "@/server/catalogue";
import { merchantPayouts } from "@/server/payouts";
import { shoeName } from "@/lib/shoe-name";

export const metadata: Metadata = { title: "Payouts" };

const STATE = {
  window: { label: "Dispute window", tone: "neutral" },
  disputed: { label: "Disputed: on hold", tone: "warn" },
  "next-batch": { label: "In next weekly payout", tone: "good" },
} as const;

export default async function MerchantPayouts() {
  const user = await requireUser("MERCHANT");
  const merchant = await getMerchantForUser(user.id);
  const { payouts, waiting } = await merchantPayouts(merchant.id);

  return (
    <main className="flex flex-col gap-8">
      <PageHeader title="Payouts" />
      <section>
        <h2 className="mb-3 font-medium">Coming up</h2>
        {waiting.length === 0 ? (
          <EmptyState title="Nothing waiting" />
        ) : (
          <ul className="flex flex-col gap-2">
            {waiting.map((i) => (
              <li key={i.id}>
                <Card className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="flex-1">
                    <span className="font-medium">{shoeName(i.shoe)}</span> · closed{" "}
                    {formatDate(i.closedAt)} · payable from {formatDate(i.payableAt)}
                  </span>
                  <Badge tone={STATE[i.state].tone}>{STATE[i.state].label}</Badge>
                  <span className="font-medium">{formatLKR(i.payable)}</span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-medium">Paid</h2>
        {payouts.length === 0 ? (
          <EmptyState title="No payouts yet" />
        ) : (
          <ul className="flex flex-col gap-3">
            {payouts.map((p) => (
              <li key={p.id}>
                <Card className="text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {p.batchKey} · {formatLKR(p.amount.toString())}
                    </span>
                    <span className="text-subtle">
                      {p.status === "PAID"
                        ? `Paid ${formatDate(p.paidAt)}`
                        : p.status.toLowerCase()}{" "}
                      · <span className="font-mono text-xs">{p.reference}</span>
                    </span>
                  </div>
                  <ul className="mt-2 text-subtle">
                    {p.items.map((i) => (
                      <li key={i.id}>
                        {shoeName(i.shoe)}: {formatLKR(i.merchantShare?.toString() ?? "0")}
                        {i.disputes.some((d) => d.status === "UPHELD") &&
                          " (adjusted by a dispute)"}
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
