import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import {
  CATEGORIES,
  LIFESPAN_MAX_DAYS,
  LIFESPAN_MIN_DAYS,
  LISTING_PHOTOS,
} from "@/server/catalogue";
import { NewShoeForm } from "./new-shoe-form";

export const metadata: Metadata = { title: "Add shoe" };

export default async function NewShoePage() {
  await requireUser("MERCHANT");
  return (
    <main>
      <PageHeader
        title="Add a shoe"
        description="Saved as a draft. You'll see its price curve before you publish."
      />
      <NewShoeForm
        categories={CATEGORIES}
        photoSlots={LISTING_PHOTOS}
        lifespanMin={LIFESPAN_MIN_DAYS}
        lifespanMax={LIFESPAN_MAX_DAYS}
      />
    </main>
  );
}
