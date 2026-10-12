import type { Metadata } from "next";
import { StylePackList } from "@/components/style-pack-list";
import { LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { listPacks } from "@/server/packs";

export const metadata: Metadata = { title: "Style packs" };

export default async function MerchantPacksPage() {
  const user = await requireUser("MERCHANT");
  const packs = await listPacks(user);
  return (
    <main>
      <PageHeader
        title="Style packs"
        description="Curate rotations of pairs from any shop. An admin reviews each pack before borrowers see it."
        actions={<LinkButton href="/merchant/packs/new">New pack</LinkButton>}
      />
      <StylePackList packs={packs} base="/merchant/packs" />
    </main>
  );
}
