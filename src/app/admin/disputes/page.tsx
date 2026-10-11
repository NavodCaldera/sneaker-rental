import type { Metadata } from "next";
import { PhotoImg } from "@/components/shoe-bits";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { listDisputes } from "@/server/disputes";
import { DecideForm } from "./decide-form";

export const metadata: Metadata = { title: "Disputes" };

const RESOLUTION = {
  CHARGE_DEPOSIT: "Charged tokens",
  REFUND_BORROWER: "Refunded borrower",
  NO_ACTION: "No action",
} as const;

export default async function AdminDisputes({ searchParams }: PageProps<"/admin/disputes">) {
  await requireUser("ADMIN");
  const { show } = await searchParams;
  const scope = show === "decided" ? "decided" : "open";
  const disputes = await listDisputes(scope);

  return (
    <main>
      <PageHeader
        title="Disputes"
        description="Compare the listing baseline with the handover photos and the trip log, then decide. The payout for the rental is held until you do."
        actions={
          <a href={scope === "open" ? "?show=decided" : "?"} className="text-sm underline">
            {scope === "open" ? "Show decided" : "Show open"}
          </a>
        }
      />
      {disputes.length === 0 ? (
        <EmptyState title={scope === "open" ? "No open disputes" : "No decided disputes yet"} />
      ) : (
        <ul className="flex flex-col gap-4">
          {disputes.map((d) => {
            const item = d.rentalItem;
            const trips = [...item.deliveries, ...item.outgoing];
            return (
              <li key={d.id}>
                <Card className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {item.shoe.brand} {item.shoe.model}
                    </span>
                    <span className="text-sm text-subtle">
                      {item.shoe.merchant.businessName} · borrower {item.rental.borrower.name}
                    </span>
                    {d.status === "OPEN" ? (
                      <Badge tone="warn">Open</Badge>
                    ) : (
                      <Badge tone={d.status === "UPHELD" ? "good" : "neutral"}>
                        {d.resolution ? RESOLUTION[d.resolution] : d.status.toLowerCase()}
                        {d.amount ? ` · ${formatLKR(d.amount.toString())}` : ""}
                      </Badge>
                    )}
                  </div>
                  <blockquote className="border-l-2 border-line pl-3 text-sm">
                    &ldquo;{d.reason}&rdquo;
                    <footer className="mt-1 text-xs text-subtle">
                      {d.openedBy.name} ({d.openedBy.role.toLowerCase()}) ·{" "}
                      {formatDateTime(d.createdAt)}
                    </footer>
                  </blockquote>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Evidence title="Listing baseline">
                      {item.shoe.photos.map((p) => (
                        <PhotoImg
                          key={p.id}
                          id={p.id}
                          alt={p.kind.toLowerCase()}
                          className="size-20 rounded-md"
                        />
                      ))}
                    </Evidence>
                    {item.conditionReports.map((r) => (
                      <Evidence
                        key={r.id}
                        title={`${r.stage === "RECEIPT" ? "Receipt" : "Return"} · grade ${r.grade}${r.damageFlag ? " · damage flagged" : ""}`}
                        note={r.notes}
                      >
                        {r.photos.map((p) => (
                          <PhotoImg
                            key={p.id}
                            id={p.id}
                            alt="condition"
                            className="size-20 rounded-md"
                          />
                        ))}
                      </Evidence>
                    ))}
                    {trips.map((t) => (
                      <Evidence
                        key={t.id}
                        title={`Trip: ${t.type.toLowerCase()} · ${t.status.toLowerCase()}`}
                        note={(Array.isArray(t.tripLog)
                          ? (t.tripLog as { at: string; status: string }[])
                          : []
                        )
                          .map((e) => `${formatDateTime(e.at)} ${e.status.toLowerCase()}`)
                          .join(" · ")}
                      >
                        {t.photos.map((p) => (
                          <PhotoImg
                            key={p.id}
                            id={p.id}
                            alt={p.kind.toLowerCase()}
                            className="size-20 rounded-md"
                          />
                        ))}
                      </Evidence>
                    ))}
                  </div>

                  <p className="text-sm text-subtle">
                    Charged {item.charge ? formatLKR(item.charge.toString()) : "—"} · merchant share{" "}
                    {item.merchantShare ? formatLKR(item.merchantShare.toString()) : "—"}
                  </p>
                  {d.status === "OPEN" ? (
                    <DecideForm disputeId={d.id} />
                  ) : (
                    <p className="text-sm">
                      <strong>Decision:</strong> {d.decision} ({d.decidedBy?.name},{" "}
                      {formatDateTime(d.decidedAt)})
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function Evidence({
  title,
  note,
  children,
}: {
  title: string;
  note?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="mb-2 text-xs font-medium">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
      {note && <p className="mt-2 text-xs text-subtle">{note}</p>}
    </div>
  );
}
