import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import {
  CATEGORIES,
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
  const limits = listingLimits(await getActiveSettings(), merchant);
  return (
    <main>
      <PageHeader
        title="Add a shoe"
        description="Saved as a draft. You'll see its price curve before you publish."
      />
      <NewShoeForm
        categories={CATEGORIES}
        photoSlots={LISTING_PHOTOS}
        lifespanMin={limits.minLifespanDays}
        lifespanMax={limits.maxLifespanDays}
        monthsMin={daysToMonths(limits.minLifespanDays)}
        monthsMax={daysToMonths(limits.maxLifespanDays)}
        pickupAddress={user.address}
      />
    </main>
  );
}
