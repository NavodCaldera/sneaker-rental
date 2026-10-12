import type { Metadata } from "next";
import { StylePackList } from "@/components/style-pack-list";
import { LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { listPacks } from "@/server/packs";

export const metadata: Metadata = { title: "Style packs" };

export default async function AdminPacksPage() {
  const user = await requireUser("ADMIN");
  const packs = await listPacks(user);
  return (
    <main>
      <PageHeader
        title="Style packs"
        description="Every pack. Merchants' packs wait here for your review; your own can be published straight away."
        actions={<LinkButton href="/admin/packs/new">New pack</LinkButton>}
      />
      <StylePackList packs={packs} base="/admin/packs" showMaker />
    </main>
  );
}
