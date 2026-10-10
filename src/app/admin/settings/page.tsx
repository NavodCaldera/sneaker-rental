import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getActiveSettings } from "@/server/settings";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettings() {
  await requireUser("ADMIN");
  const [active, history] = await Promise.all([
    getActiveSettings(),
    db.pricingSettings.findMany({ orderBy: { effectiveFrom: "desc" }, take: 10 }),
  ]);
  const values = {
    merchantMargin: active.merchantMargin.toString(),
    platformMargin: active.platformMargin.toString(),
    floor: active.floor.toString(),
    midpointRatio: active.midpointRatio.toString(),
    baseSteepness: active.baseSteepness.toString(),
    refLife: String(active.refLife),
    minLifespanDays: String(active.minLifespanDays),
    maxLifespanDays: String(active.maxLifespanDays),
    maxDiscount: active.maxDiscount.toString(),
    releaseLeadDays: String(active.releaseLeadDays),
    releaseDiscountStep: active.releaseDiscountStep.toString(),
    capitalRate: active.capitalRate.toString(),
    holdCost: active.holdCost.toFixed(2),
    depositPerPair: active.depositPerPair.toFixed(2),
    maxPairsPerBundle: String(active.maxPairsPerBundle),
    disputeWindowDays: String(active.disputeWindowDays),
    freeReturnHours: String(active.freeReturnHours),
    deliveryBookingFee: active.deliveryBookingFee?.toFixed(2) ?? "",
    catchUpEnabled: active.catchUpEnabled,
  };

  return (
    <main className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <PageHeader
          title="Pricing settings"
          description="Every change is saved as a new version. Each shoe is priced with the version active when it was published, so margin and curve changes apply to new listings only. Deposits, bundle size, windows and fees apply from now on."
        />
        <Card>
          <SettingsForm values={values} />
        </Card>
      </div>
      <aside className="lg:pt-14">
        <h2 className="mb-2 text-sm font-medium">History</h2>
        <ul className="flex flex-col gap-2 text-xs text-subtle">
          {history.map((h) => (
            <li key={h.id} className="rounded-lg border border-line p-2">
              <div className="font-medium text-ink">{formatDateTime(h.effectiveFrom)}</div>
              μm {h.merchantMargin.toString()} · μp {h.platformMargin.toString()} · floor{" "}
              {h.floor.toString()} · deposit {h.depositPerPair.toFixed(0)} · fee{" "}
              {h.deliveryBookingFee?.toFixed(2) ?? "TBD"} · catch-up{" "}
              {h.catchUpEnabled ? "on" : "off"}
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
