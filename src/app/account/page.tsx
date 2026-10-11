import type { Metadata } from "next";
import { AddressForm } from "@/components/address-form";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Account" };

/** A customer's account: their one delivery and collection address. */
export default async function CustomerAccount() {
  const user = await requireUser("BORROWER");
  return (
    <main className="max-w-xl">
      <PageHeader title="Account" description={`${user.name} · ${user.email}`} />
      <Card>
        <AddressForm role="BORROWER" current={user.address} />
      </Card>
    </main>
  );
}
