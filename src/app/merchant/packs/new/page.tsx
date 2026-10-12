import type { Metadata } from "next";
import { StylePackEditor } from "@/components/style-pack-editor";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { pickablePairs } from "@/server/packs";

export const metadata: Metadata = { title: "New style pack" };

export default async function NewMerchantPackPage() {
  await requireUser("MERCHANT");
  return (
    <main>
      <PageHeader title="New style pack" />
      <StylePackEditor packId={null} pairs={await pickablePairs()} canPublishNow={false} />
    </main>
  );
}
