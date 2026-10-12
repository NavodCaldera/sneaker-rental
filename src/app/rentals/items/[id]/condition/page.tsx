import type { Metadata } from "next";
import { BackButton } from "@/components/back-button";
import { notFound } from "next/navigation";
import { ConditionForm } from "@/components/condition-form";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { recordConditionAction } from "../../../actions";
import { shoeName } from "@/lib/shoe-name";

export const metadata: Metadata = { title: "Confirm condition" };

export default async function BorrowerConditionPage({
  params,
}: PageProps<"/rentals/items/[id]/condition">) {
  const { id } = await params;
  const user = await requireUser("BORROWER");
  const item = await db.rentalItem.findFirst({
    where: { id, rental: { borrowerId: user.id } },
    include: { shoe: true, deliveries: { where: { type: "HANDOFF" } } },
  });
  if (!item) notFound();
  const viaHandoff = item.deliveries.length > 0;

  return (
    <main className="max-w-2xl">
      <BackButton href="/rentals" to="my rentals" className="mb-4" />
      <PageHeader
        title="Confirm condition"
        description={`${shoeName(item.shoe)} · ${item.shoe.size}`}
      />
      <Card>
        <p className="mb-4 text-sm text-subtle">
          Photograph the pair as it arrived.{" "}
          {viaHandoff
            ? "It came straight from the previous borrower, so your photos also close their rental."
            : "Your rental started on the delivery date."}
        </p>
        <ConditionForm
          action={recordConditionAction.bind(null, item.id, "/rentals")}
          submitLabel="Confirm condition"
        />
      </Card>
    </main>
  );
}
