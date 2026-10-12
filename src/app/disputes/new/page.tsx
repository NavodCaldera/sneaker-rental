import type { Metadata } from "next";
import { BackButton } from "@/components/back-button";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { formatDate, formatLKR } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { OpenDisputeForm } from "./open-dispute-form";
import { shoeName } from "@/lib/shoe-name";

export const metadata: Metadata = { title: "Report a problem" };

export default async function NewDisputePage({ searchParams }: PageProps<"/disputes/new">) {
  const user = await requireUser("BORROWER", "MERCHANT");
  const { item: itemId } = await searchParams;
  if (typeof itemId !== "string") notFound();
  const item = await db.rentalItem.findFirst({
    where: {
      id: itemId,
      OR: [{ rental: { borrowerId: user.id } }, { shoe: { merchant: { userId: user.id } } }],
    },
    include: { shoe: true },
  });
  if (!item) notFound();
  const back = user.role === "MERCHANT" ? `/merchant/shoes/${item.shoeId}` : "/rentals";

  return (
    <main className="max-w-xl">
      <BackButton href="/rentals" to="my rentals" className="mb-4" />
      <PageHeader
        title="Report a problem"
        description={`${shoeName(item.shoe)} · closed ${formatDate(item.closedAt)} · charged ${formatLKR(item.charge?.toString() ?? "0")}`}
      />
      <Card>
        <p className="mb-4 text-sm text-subtle">
          You can open a dispute until {formatDate(item.payableAt)}. An admin reviews the condition
          photos and trip log and decides; the payout for this rental is held until then.
        </p>
        <OpenDisputeForm itemId={item.id} back={back} />
      </Card>
    </main>
  );
}
