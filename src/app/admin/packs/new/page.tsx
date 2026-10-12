import type { Metadata } from "next";
import { BackButton } from "@/components/back-button";
import { StylePackEditor } from "@/components/style-pack-editor";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { pickablePairs } from "@/server/packs";

export const metadata: Metadata = { title: "New style pack" };

export default async function NewAdminPackPage() {
  await requireUser("ADMIN");
  return (
    <main>
      <BackButton href="/admin/packs" to="style packs" className="mb-4" />
      <PageHeader title="New style pack" />
      <StylePackEditor packId={null} pairs={await pickablePairs()} canPublishNow={true} />
    </main>
  );
}
