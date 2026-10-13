import type { Metadata } from "next";
import { AddressForm } from "@/components/address-form";
import { ProfileForm } from "@/components/profile-form";
import { Card, PageHeader } from "@/components/ui";
import { ageOn, isoDate } from "@/lib/borrower-profile";
import { colomboToday } from "@/server/auth/service";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Account" };

/** A customer's account: their profile, and their one delivery and collection address. */
export default async function CustomerAccount() {
  const user = await requireUser("BORROWER");
  const today = colomboToday();
  return (
    <main className="flex max-w-xl flex-col gap-4">
      <PageHeader title="Account" description={`${user.name} · ${user.email}`} />
      <Card>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">
          About you
          {user.dateOfBirth && (
            <span className="ml-2 text-sm font-normal text-subtle">
              Age {ageOn(isoDate(user.dateOfBirth), today)}
            </span>
          )}
        </h2>
        <ProfileForm current={user} today={today} />
      </Card>
      <Card>
        <AddressForm role="BORROWER" current={user.address} currentCity={user.city} />
      </Card>
    </main>
  );
}
