import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { CATEGORIES, LISTING_PHOTOS } from "@/server/catalogue";
import { getActiveSettings } from "@/server/settings";
import { NewShoeForm } from "./new-shoe-form";

export const metadata: Metadata = { title: "Add shoe" };

export default async function NewShoePage() {
  await requireUser("MERCHANT");
  const settings = await getActiveSettings();
  return (
    <main>
      <PageHeader
        title="Add a shoe"
        description="Saved as a draft. You'll see its price curve before you publish."
      />
      <NewShoeForm
        categories={CATEGORIES}
        photoSlots={LISTING_PHOTOS}
        lifespanMin={settings.minLifespanDays}
        lifespanMax={settings.maxLifespanDays}
      />
    </main>
  );
}
