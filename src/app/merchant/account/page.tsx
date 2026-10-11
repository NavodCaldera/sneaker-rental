import type { Metadata } from "next";
import { AddressForm } from "@/components/address-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { getMerchantForUser } from "@/server/catalogue";
import { PayoutForm } from "./payout-form";

export const metadata: Metadata = { title: "Account" };

export default async function MerchantAccount() {
  const user = await requireUser("MERCHANT");
  const merchant = await getMerchantForUser(user.id);
  return (
    <main className="max-w-xl">
      <PageHeader title="Account" description={merchant.businessName} />
      <Card className="mb-4 flex items-center justify-between">
        <span className="text-sm">Business verification</span>
        {merchant.verified ? (
          <Badge tone="good">Verified</Badge>
        ) : (
          <Badge tone="warn">Pending</Badge>
        )}
      </Card>
      <Card className="mb-4">
        <AddressForm role="MERCHANT" current={user.address} currentCity={user.city} />
      </Card>
      <Card>
        <PayoutForm current={merchant.payoutAccount ?? ""} />
      </Card>
    </main>
  );
}
