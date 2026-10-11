import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { adminOverview } from "@/server/admin";
import { requireUser } from "@/server/auth/session";
import { markLost } from "@/server/payments";
import { shoeName } from "@/lib/shoe-name";

export const metadata: Metadata = { title: "Admin" };

async function markLostAction(itemId: string) {
  "use server";
  await requireUser("ADMIN");
  await markLost(itemId);
  revalidatePath("/admin");
}

export default async function AdminHome() {
  await requireUser("ADMIN");
  const o = await adminOverview();
  const tiles = [
    { label: "Trips to arrange", value: o.openDeliveries, href: "/admin/deliveries" },
    { label: "Open disputes", value: o.openDisputes, href: "/admin/disputes" },
    { label: "Pairs with borrowers", value: o.activeItems.length, href: "#active" },
    { label: "Pairs available", value: o.available, href: "/browse" },
    { label: "Merchants to verify", value: o.merchantsPending, href: "/admin/merchants" },
  ];

  return (
    <main className="flex flex-col gap-8">
      <PageHeader title="Admin overview" />
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link
              href={t.href}
              className="block rounded-xl border border-line p-4 hover:bg-muted/50"
            >
              <div className="text-2xl font-semibold">{t.value}</div>
              <div className="text-sm text-subtle">{t.label}</div>
            </Link>
          </li>
        ))}
      </ul>

      <section id="active">
        <h2 className="mb-3 font-medium">Pairs with borrowers</h2>
        {o.activeItems.length === 0 ? (
          <EmptyState title="No pairs out right now" />
        ) : (
          <ul className="flex flex-col gap-2">
            {o.activeItems.map((item) => (
              <li key={item.id}>
                <Card className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{shoeName(item.shoe)}</span> · {item.shoe.size} ·{" "}
                    {item.rental.borrower.name} ({item.rental.borrower.email}) · since{" "}
                    {formatDate(item.startDate)}
                  </div>
                  <Badge tone={item.status === "RETURNING" ? "warn" : "info"}>
                    {item.status === "RETURNING" ? "Returning" : "With borrower"}
                  </Badge>
                  <form action={markLostAction.bind(null, item.id)}>
                    <Button
                      type="submit"
                      variant="danger"
                      aria-label={`Mark ${shoeName(item.shoe)} as lost`}
                    >
                      Mark lost
                    </Button>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-subtle">
          Marking a pair lost charges the borrower what it had left to earn (deposit first), retires
          the pair and locks the account.
        </p>
      </section>
    </main>
  );
}
