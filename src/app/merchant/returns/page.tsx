import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { PhotoImg } from "@/components/shoe-bits";
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getMerchantForUser } from "@/server/catalogue";
import { markCleaned } from "@/server/booking/lifecycle";
import { merchantReturns } from "@/server/booking/queries";
import { shoeName } from "@/lib/shoe-name";

export const metadata: Metadata = { title: "Returns" };

async function markCleanedAction(shoeId: string) {
  "use server";
  const user = await requireUser("MERCHANT");
  const merchant = await getMerchantForUser(user.id);
  await markCleaned(merchant.id, shoeId);
  revalidatePath("/merchant/returns");
}

export default async function MerchantReturns() {
  const user = await requireUser("MERCHANT");
  const merchant = await getMerchantForUser(user.id);
  const { returned, cleaning, inTransit } = await merchantReturns(merchant.id);

  return (
    <main className="flex flex-col gap-8">
      <PageHeader
        title="Returns"
        description="Record condition when a pair comes back, then put it back in stock once it's clean."
      />

      <section>
        <h2 className="mb-3 font-medium">Returned: record condition</h2>
        {returned.length === 0 ? (
          <EmptyState title="Nothing to check" />
        ) : (
          <ul className="flex flex-col gap-3">
            {returned.map((item) => (
              <li key={item.id}>
                <Card className="flex flex-wrap items-center gap-4 p-3">
                  <PhotoImg id={item.shoe.photos[0]?.id} alt="" className="size-14 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {shoeName(item.shoe)} · {item.shoe.size}
                    </div>
                    <div className="text-sm text-subtle">
                      From {item.rental.borrower.name} · arrived {formatDate(item.endDate)}
                    </div>
                  </div>
                  <LinkButton href={`/merchant/returns/${item.id}`}>Record condition</LinkButton>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-medium">Cleaning</h2>
        {cleaning.length === 0 ? (
          <EmptyState title="Nothing being cleaned" />
        ) : (
          <ul className="flex flex-col gap-3">
            {cleaning.map((shoe) => (
              <li key={shoe.id}>
                <Card className="flex flex-wrap items-center gap-4 p-3">
                  <PhotoImg id={shoe.photos[0]?.id} alt="" className="size-14 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {shoeName(shoe)} · {shoe.size}
                    </div>
                    <div className="text-sm text-subtle">Grade {shoe.latestGrade ?? "—"}</div>
                  </div>
                  <form action={markCleanedAction.bind(null, shoe.id)}>
                    <Button type="submit">Cleaned, back in stock</Button>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inTransit.length > 0 && (
        <section>
          <h2 className="mb-3 font-medium">Ended, not back yet</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {inTransit.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                {shoeName(item.shoe)}{" "}
                <Badge tone="info">
                  {item.deliveries.some((d) => d.type === "COLLECT")
                    ? "Collection requested"
                    : item.outgoing.length > 0
                      ? "Going to the next borrower"
                      : "Waiting with the borrower for the next booking"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
