import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { isoWeek, payoutPreview, recentPayouts, runPayoutBatch } from "@/server/payouts";

export const metadata: Metadata = { title: "Payouts" };

async function runBatchAction() {
  "use server";
  await requireUser("ADMIN");
  await runPayoutBatch();
  revalidatePath("/admin/payouts");
}

export default async function AdminPayouts() {
  await requireUser("ADMIN");
  const [preview, history] = await Promise.all([payoutPreview(), recentPayouts()]);
  return (
    <main className="flex flex-col gap-8">
      <PageHeader
        title="Payouts"
        description={`Merchant shares become payable 3 days after a rental closes, unless disputed. This week: ${isoWeek(new Date())}.`}
        actions={
          <form action={runBatchAction}>
            <Button type="submit" disabled={preview.length === 0}>
              Run this week&apos;s payouts
            </Button>
          </form>
        }
      />
      <section>
        <h2 className="mb-3 font-medium">Ready to pay</h2>
        {preview.length === 0 ? (
          <EmptyState title="Nothing payable yet" />
        ) : (
          <ul className="flex flex-col gap-2">
            {preview.map((p) => (
              <li key={p.merchantId}>
                <Card className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="flex-1 font-medium">{p.businessName}</span>
                  <span className="text-subtle">{p.items} rentals</span>
                  {!p.hasAccount && <Badge tone="warn">No payout account</Badge>}
                  <span className="font-medium">{formatLKR(p.amount)}</span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-medium">History</h2>
        {history.length === 0 ? (
          <EmptyState title="No payouts yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-subtle">
                <tr>
                  <th className="py-2 font-medium">Week</th>
                  <th className="py-2 font-medium">Merchant</th>
                  <th className="py-2 font-medium">Rentals</th>
                  <th className="py-2 font-medium">Paid</th>
                  <th className="py-2 font-medium">Reference</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="py-2">{p.batchKey}</td>
                    <td className="py-2">{p.merchant.businessName}</td>
                    <td className="py-2">{p._count.items}</td>
                    <td className="py-2">
                      {p.status === "PAID" ? formatDateTime(p.paidAt) : p.status.toLowerCase()}
                    </td>
                    <td className="py-2 font-mono text-xs">{p.reference ?? "—"}</td>
                    <td className="py-2 text-right">{formatLKR(p.amount.toString())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
