import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { recordConditionAction } from "@/app/rentals/actions";
import { ConditionForm } from "@/components/condition-form";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { getMerchantForUser } from "@/server/catalogue";
import { db } from "@/server/db";
import { getActiveSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Record condition" };

export default async function MerchantConditionPage({
  params,
}: PageProps<"/merchant/returns/[itemId]">) {
  const { itemId } = await params;
  const user = await requireUser("MERCHANT");
  const merchant = await getMerchantForUser(user.id);
  const item = await db.rentalItem.findFirst({
    where: { id: itemId, shoe: { merchantId: merchant.id }, status: "RETURNING" },
    include: { shoe: true, rental: { include: { borrower: { select: { name: true } } } } },
  });
  if (!item) notFound();
  const settings = await getActiveSettings();

  return (
    <main className="max-w-2xl">
      <PageHeader
        title="Record condition"
        description={`${item.shoe.brand} ${item.shoe.model} · returned by ${item.rental.borrower.name}`}
      />
      <Card>
        <p className="mb-4 text-sm text-subtle">
          Recording condition closes the rental: the borrower is charged for the wear they added and
          your share joins a payout after the {settings.disputeWindowDays}-day dispute window.
        </p>
        <ConditionForm action={recordConditionAction.bind(null, item.id, "/merchant/returns")} />
      </Card>
    </main>
  );
}
