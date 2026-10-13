import type { Metadata } from "next";
import { AddressForm } from "@/components/address-form";
import { ProfileForm } from "@/components/profile-form";
import { Alert, Card, PageHeader } from "@/components/ui";
import { ageOn, inBirthdayMonth, isoDate } from "@/lib/borrower-profile";
import { getActiveSettings } from "@/server/settings";
import { colomboToday } from "@/server/auth/service";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Account" };

/** A customer's account: their profile, and their one delivery and collection address. */
export default async function CustomerAccount() {
  const user = await requireUser("BORROWER");
  const today = colomboToday();
  const settings = await getActiveSettings();
  const dob = user.dateOfBirth ? isoDate(user.dateOfBirth) : null;
  const celebrating = dob !== null && settings.birthdayFreePairs > 0 && inBirthdayMonth(dob, today);
  return (
    <main className="flex max-w-xl flex-col gap-4">
      <PageHeader title="Account" description={`${user.name} · ${user.email}`} />
      {celebrating && (
        <Alert tone="good">
          Happy birthday month! We value your celebrations: rent is on us for up to{" "}
          {settings.birthdayFreePairs} pairs for every day of this month.
        </Alert>
      )}
      <Card>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">
          About you
          {user.dateOfBirth && (
            <span className="ml-2 text-sm font-normal text-subtle">
              Age {ageOn(isoDate(user.dateOfBirth), today)}
            </span>
          )}
        </h2>
        <ProfileForm current={user} today={today} birthdayFreePairs={settings.birthdayFreePairs} />
      </Card>
      <Card>
        <AddressForm role="BORROWER" current={user.address} currentCity={user.city} />
      </Card>
    </main>
  );
}
