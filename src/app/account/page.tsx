import type { Metadata } from "next";
import { AddressForm } from "@/components/address-form";
import { Card, PageHeader } from "@/components/ui";
import { ageOn, colomboToday } from "@/lib/age";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Account" };

/** A customer's account: their one delivery and collection address. */
export default async function CustomerAccount() {
  const user = await requireUser("BORROWER");
  return (
    <main className="max-w-xl">
      <PageHeader title="Account" description={`${user.name} · ${user.email}`} />
      {user.dateOfBirth && (
        <Card className="mb-4 text-sm">
          <span className="text-subtle">Date of birth</span> {formatDate(user.dateOfBirth)} (age{" "}
          {ageOn(user.dateOfBirth.toISOString().slice(0, 10), colomboToday())})
        </Card>
      )}
      <Card>
        <AddressForm role="BORROWER" current={user.address} currentCity={user.city} />
      </Card>
    </main>
  );
}
