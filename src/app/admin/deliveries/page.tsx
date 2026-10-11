import type { Metadata } from "next";
import type { DeliveryStatus, DeliveryType } from "@/generated/prisma/client";
import { PhotoImg } from "@/components/shoe-bits";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { listDeliveries } from "@/server/logistics";
import { DeliveryControls } from "./delivery-controls";
import { shoeName } from "@/lib/shoe-name";

export const metadata: Metadata = { title: "Deliveries" };

const TYPE_LABEL: Record<DeliveryType, string> = {
  DELIVER: "Merchant → borrower",
  COLLECT: "Borrower → merchant",
  HANDOFF: "Handoff: borrower → borrower",
};

const STATUS_TONE: Record<DeliveryStatus, "neutral" | "info" | "good" | "warn" | "bad"> = {
  REQUESTED: "warn",
  QUOTED: "warn",
  BOOKED: "info",
  PICKED_UP: "info",
  DELIVERED: "good",
  CANCELLED: "neutral",
  FAILED: "bad",
};

export default async function AdminDeliveries({ searchParams }: PageProps<"/admin/deliveries">) {
  await requireUser("ADMIN");
  const { show } = await searchParams;
  const scope = show === "done" ? "done" : "open";
  const deliveries = await listDeliveries(scope);

  return (
    <main>
      <PageHeader
        title="Deliveries"
        description="Book each trip with a ride-hailing app, then send the driver the courier link. You can also update status here if the driver can't."
        actions={
          <a href={scope === "open" ? "?show=done" : "?"} className="text-sm underline">
            {scope === "open" ? "Show completed" : "Show open"}
          </a>
        }
      />
      {deliveries.length === 0 ? (
        <EmptyState title={scope === "open" ? "No trips to arrange" : "No completed trips yet"} />
      ) : (
        <ul className="flex flex-col gap-3">
          {deliveries.map((d) => {
            const log = (Array.isArray(d.tripLog) ? d.tripLog : []) as {
              at: string;
              status: string;
              by?: string;
            }[];
            const shoe = d.rentalItem.shoe;
            return (
              <li key={d.id}>
                <Card
                  className="flex flex-col gap-3"
                  aria-label={`${TYPE_LABEL[d.type]}: ${shoeName(shoe)}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{TYPE_LABEL[d.type]}</span>
                    <Badge tone={STATUS_TONE[d.status]}>
                      {d.status.toLowerCase().replace("_", " ")}
                    </Badge>
                    <span className="text-sm text-subtle">
                      {shoeName(shoe)} · {shoe.size}
                    </span>
                  </div>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-subtle">Pick up</dt>
                      <dd>{d.fromAddress}</dd>
                    </div>
                    <div>
                      <dt className="text-subtle">Drop off</dt>
                      <dd>{d.toAddress}</dd>
                    </div>
                    <div>
                      <dt className="text-subtle">Borrower</dt>
                      <dd>
                        {d.rentalItem.rental.borrower.name} ·{" "}
                        {d.rentalItem.rental.borrower.phone ?? "no phone"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-subtle">Trip fee</dt>
                      <dd>
                        {d.quote ? formatLKR(d.quote.toString()) : "not quoted"} · paid to the
                        driver by the {d.paidBy === "MERCHANT" ? "merchant" : "borrower"} receiving
                        it (not through us)
                      </dd>
                    </div>
                  </dl>
                  {d.photos.length > 0 && (
                    <div className="flex gap-2">
                      {d.photos.map((p) => (
                        <PhotoImg
                          key={p.id}
                          id={p.id}
                          alt={p.kind.toLowerCase().replace("_", " ")}
                          className="size-16 rounded-md"
                        />
                      ))}
                    </div>
                  )}
                  <DeliveryControls
                    deliveryId={d.id}
                    status={d.status}
                    quote={d.quote?.toString() ?? ""}
                  />
                  <details className="text-xs text-subtle">
                    <summary className="cursor-pointer">Trip log</summary>
                    <ol className="mt-1 space-y-0.5">
                      {log.map((e, i) => (
                        <li key={i}>
                          {formatDateTime(e.at)} · {e.status.toLowerCase()}{" "}
                          {e.by ? `· ${e.by}` : ""}
                        </li>
                      ))}
                    </ol>
                  </details>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
