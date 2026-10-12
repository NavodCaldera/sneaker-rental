import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { fullAddress } from "@/lib/address";
import { toD } from "@/lib/decimal";
import { requireUser } from "@/server/auth/session";
import {
  LISTING_PHOTOS,
  daysToMonths,
  getMerchantForUser,
  listingLimits,
} from "@/server/catalogue";
import { getActiveSettings } from "@/server/settings";
import { NewShoeForm } from "./new-shoe-form";

export const metadata: Metadata = { title: "Add shoe" };

export default async function NewShoePage() {
  const user = await requireUser("MERCHANT");
  const merchant = await getMerchantForUser(user.id);
  const settings = await getActiveSettings();
  const limits = listingLimits(settings, merchant);
  return (
    <main>
      <PageHeader title="Add a shoe" />
      <NewShoeForm
        photoSlots={LISTING_PHOTOS}
        lifespanMin={limits.minLifespanDays}
        lifespanMax={limits.maxLifespanDays}
        monthsMin={daysToMonths(limits.minLifespanDays)}
        monthsMax={daysToMonths(limits.maxLifespanDays)}
        pickupAddress={fullAddress(user)}
        floorPercent={toD(settings.floor).times(100).toString()}
      />
    </main>
  );
}
