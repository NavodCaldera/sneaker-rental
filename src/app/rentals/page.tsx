import type { Metadata } from "next";
import Link from "next/link";
import type { RentalItemStatus } from "@/generated/prisma/client";
import { PhotoImg } from "@/components/shoe-bits";
import { Alert, Badge, Button, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { formatDate, formatLKR, formatWear } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { borrowerRentals } from "@/server/booking/queries";
import { endRentalAction } from "./actions";

export const metadata: Metadata = { title: "My rentals" };

const ITEM_STATUS: Record<
  RentalItemStatus,
  { label: string; tone: "neutral" | "good" | "warn" | "bad" | "info" }
> = {
  AWAITING_DELIVERY: { label: "On its way", tone: "info" },
  WAITING_HANDOFF: { label: "Reserved next", tone: "info" },
  ACTIVE: { label: "With you", tone: "good" },
  RETURNING: { label: "Returning", tone: "warn" },
  CLOSED: { label: "Closed", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  LOST: { label: "Lost", tone: "bad" },
};

const DEPOSIT_LABEL = {
  held: "held",
  released: "released",
  captured: "partly captured",
  none: "not taken",
} as const;

export default async function RentalsPage({ searchParams }: PageProps<"/rentals">) {
  const user = await requireUser("BORROWER");
  const { booked } = await searchParams;
  const rentals = await borrowerRentals(user.id);

  return (
    <main>
      <PageHeader title="My rentals" />
      {booked && (
        <div className="mb-4">
          <Alert tone="good">
            Booked. We&apos;ll arrange delivery and let you know when it&apos;s on the way.
          </Alert>
        </div>
      )}
      {rentals.length === 0 ? (
        <EmptyState title="No rentals yet">
          <Link href="/browse" className="underline">
            Browse sneakers
          </Link>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {rentals.map((rental) => (
            <section key={rental.id} aria-label={`Rental from ${formatDate(rental.createdAt)}`}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <h2 className="font-medium">Booked {formatDate(rental.createdAt)}</h2>
                <span className="flex flex-wrap items-center gap-2 text-subtle">
                  Deposit {formatLKR(rental.depositAmount.toString())}
                  <Badge tone={rental.depositStatus === "captured" ? "warn" : "neutral"}>
                    {DEPOSIT_LABEL[rental.depositStatus]}
                  </Badge>
                  · estimate {formatLKR(rental.estimate.toString())}
                </span>
              </div>
              <ul className="flex flex-col gap-3">
                {rental.items.map((item) => {
                  const status = ITEM_STATUS[item.status];
                  const name = `${item.shoe.brand} ${item.shoe.model}`;
                  return (
                    <li key={item.id}>
                      <Card className="flex flex-wrap items-center gap-4 p-3">
                        <PhotoImg
                          id={item.shoe.photos[0]?.id}
                          alt=""
                          className="size-16 shrink-0 rounded-lg"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{name}</span>
                            <span className="text-sm text-subtle">{item.shoe.size}</span>
                            <Badge tone={status.tone}>{status.label}</Badge>
                            {item.disputes.some((d) => d.status === "OPEN") && (
                              <Badge tone="warn">Under review</Badge>
                            )}
                          </div>
                          <div className="mt-1 text-sm text-subtle">
                            {item.startDate && <>Since {formatDate(item.startDate)}</>}
                            {item.live && (
                              <>
                                {" "}
                                · {formatWear(item.live.wearSoFar)} wear-days so far ·{" "}
                                {formatLKR(item.live.chargeSoFar)} so far
                              </>
                            )}
                            {item.status === "CLOSED" && item.charge && (
                              <>
                                {" "}
                                · wear {formatWear(item.wearStart!.toString())} →{" "}
                                {formatWear(item.wearEnd!.toString())} · charged{" "}
                                {formatLKR(item.charge.toString())}
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {item.needsReceipt && (
                            <LinkButton href={`/rentals/items/${item.id}/condition`}>
                              Confirm condition
                            </LinkButton>
                          )}
                          {item.status === "ACTIVE" && (
                            <form action={endRentalAction.bind(null, item.id)}>
                              <Button
                                type="submit"
                                variant="secondary"
                                aria-label={`End rental of ${name}`}
                              >
                                End rental
                              </Button>
                            </form>
                          )}
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
