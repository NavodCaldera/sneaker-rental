import type { Metadata } from "next";
import { BackButton } from "@/components/back-button";
import { notFound } from "next/navigation";
import { StylePackEditor } from "@/components/style-pack-editor";
import { StylePackStatusPanel } from "@/components/style-pack-status";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { PackError, getPackForEdit, pickablePairs } from "@/server/packs";

export const metadata: Metadata = { title: "Style pack" };

export default async function AdminPackPage({ params }: PageProps<"/admin/packs/[id]">) {
  const { id } = await params;
  const user = await requireUser("ADMIN");
  const found = await getPackForEdit(user, id).catch((e) => {
    if (e instanceof PackError) notFound();
    throw e;
  });
  const { pack, input } = found;
  return (
    <main className="flex flex-col gap-6">
      <BackButton href="/admin/packs" to="style packs" />
      <PageHeader title={pack.title} />
      <StylePackStatusPanel
        packId={pack.id}
        status={pack.status}
        reviewNote={pack.reviewNote}
        viewer="ADMIN"
        madeByMerchant={pack.createdBy.role === "MERCHANT"}
      />
      <StylePackEditor packId={pack.id} pairs={await pickablePairs()} initial={input} />
    </main>
  );
}
