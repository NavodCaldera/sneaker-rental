import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { listMerchants, setMerchantVerified } from "@/server/catalogue";

export const metadata: Metadata = { title: "Merchants" };

async function toggleVerified(merchantId: string, verified: boolean) {
  "use server";
  await requireUser("ADMIN");
  await setMerchantVerified(merchantId, verified);
  revalidatePath("/admin/merchants");
}

export default async function AdminMerchants() {
  await requireUser("ADMIN");
  const merchants = await listMerchants();
  return (
    <main>
      <PageHeader
        title="Merchants"
        description="Verify businesses before their shoes can be published."
      />
      <div className="grid gap-3">
        {merchants.map((m) => (
          <Card key={m.id} className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 font-medium">
                {m.businessName}
                {m.verified ? (
                  <Badge tone="good">Verified</Badge>
                ) : (
                  <Badge tone="warn">Pending</Badge>
                )}
              </div>
              <div className="text-sm text-subtle">
                {m.user.name} · {m.user.email} · {m.user.phone ?? "no phone"} · {m._count.shoes}{" "}
                shoes · joined {formatDate(m.createdAt)}
              </div>
              <div className="text-xs text-subtle">
                Payout account: {m.payoutAccount ?? "not set"}
              </div>
            </div>
            <form action={toggleVerified.bind(null, m.id, !m.verified)}>
              <Button type="submit" variant={m.verified ? "secondary" : "primary"}>
                {m.verified ? "Revoke" : "Verify"}
              </Button>
            </form>
          </Card>
        ))}
      </div>
    </main>
  );
}
