import type { Metadata } from "next";
import Link from "next/link";
import type { RentalItemStatus } from "@/generated/prisma/client";
import { PhotoImg } from "@/components/shoe-bits";
import { Alert, Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime, formatLKR, formatTokens, formatWear } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { borrowerRentals } from "@/server/booking/queries";
import { EarlyReturnForm, EndRentalForm, ExtendForm, OfferButtons } from "./item-forms";

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

export default async function RentalsPage({ searchParams }: PageProps<"/rentals">) {
  const user = await requireUser("BORROWER");
  const { booked } = await searchParams;
  const rentals = await borrowerRentals(user.id);
  const now = new Date();

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
            Browse shoes
          </Link>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {rentals.map((rental) => (
            <section key={rental.id} aria-label={`Rental from ${formatDate(rental.createdAt)}`}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <h2 className="font-medium">Booked {formatDate(rental.createdAt)}</h2>
                <span className="flex flex-wrap items-center gap-2 text-subtle">
                  rent estimate {formatLKR(rental.estimatedRent.toString())} ·{" "}
                  {formatTokens(rental.locked)} locked (deposit and rent estimate)
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
                            {item.firstDay ? (
                              <>
                                Days {formatDate(item.firstDay)} –{" "}
                                {formatDate(item.lastDay ?? item.termEndDay)}
                              </>
                            ) : item.expected ? (
                              <>
                                Expected days {formatDate(item.expected.first)} –{" "}
                                {formatDate(item.expected.last)}
                              </>
                            ) : (
                              item.plannedDays && (
                                <>{item.plannedDays}-day term from the day after delivery</>
                              )
                            )}
                            {item.plannedWearEnd && item.status !== "CLOSED" && (
                              <>
                                {" "}
                                · wear {formatWear(item.plannedWearStart!.toString())} →{" "}
                                {formatWear(item.plannedWearEnd.toString())} of{" "}
                                {item.shoe.lifespanDays} · rent estimate{" "}
                                {formatLKR(item.plannedCharge?.toString() ?? "0")}, locked until
                                it&apos;s back
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
                          {item.offerCharge && (
                            <div className="mt-2 flex flex-col gap-2">
                              <Alert tone="info">
                                The borrower before you is returning this pair early
                                {item.offerFirstDay && item.plannedFirstDay && (
                                  <>
                                    , so it can come to you with day 1 on{" "}
                                    <strong>{formatDate(item.offerFirstDay)}</strong> instead of{" "}
                                    {formatDate(item.plannedFirstDay)}
                                  </>
                                )}
                                . It will have {formatWear(item.offerWearStart!.toString())}{" "}
                                wear-days used, not {formatWear(item.plannedWearStart!.toString())},
                                and a pair with less wear costs more per day: your{" "}
                                {item.plannedDays}-day rent estimate is now{" "}
                                <strong>{formatTokens(item.offerCharge.toString())}</strong> instead
                                of {formatTokens(item.plannedCharge!.toString())}. Accept by{" "}
                                {formatDateTime(item.offerDueAt)} to take it on these terms. If
                                you&apos;d rather keep your original dates, say no or don&apos;t
                                answer: we cancel your reservation and unlock all its tokens.
                              </Alert>
                              <OfferButtons itemId={item.id} />
                            </div>
                          )}
                          {item.keepingForNext && (
                            <p className="mt-2 text-sm text-subtle">
                              {item.holdForNext
                                ? "Please keep the pair safe for now: as soon as the next borrower books it, a driver takes it straight to them. You aren't charged for these days."
                                : "Please keep the pair safe for now: the next borrower is deciding whether to take it early, and we'll book the driver as soon as they answer. You aren't charged for these days."}
                            </p>
                          )}
                          {item.earlyReturnAt && item.status === "ACTIVE" && (
                            <p className="mt-2 text-sm text-subtle">
                              Early return booked: your last day is {formatDate(item.termEndDay)}. A
                              driver collects the pair the day after.
                            </p>
                          )}
                          {item.canExtend && (
                            <div className="mt-2">
                              <ExtendForm itemId={item.id} name={name} />
                            </div>
                          )}
                          {item.earlyReturn && (
                            <div className="mt-2">
                              <EarlyReturnForm
                                itemId={item.id}
                                name={name}
                                min={item.earlyReturn.min}
                                max={item.earlyReturn.max}
                                noticeDays={item.noticeDays}
                              />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {item.needsReceipt && (
                            <LinkButton href={`/rentals/items/${item.id}/condition`}>
                              Confirm condition
                            </LinkButton>
                          )}
                          {(item.status === "CLOSED" || item.status === "LOST") &&
                            item.payableAt &&
                            item.payableAt > now &&
                            !item.disputes.some((d) => d.status === "OPEN") && (
                              <LinkButton
                                href={`/disputes/new?item=${item.id}`}
                                variant="secondary"
                              >
                                Report a problem
                              </LinkButton>
                            )}
                          {item.canEndNow && <EndRentalForm itemId={item.id} name={name} />}
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
