import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CurveChart } from "@/components/curve-chart";
import { PhotoImg, ShoeStatusBadge, WearBar } from "@/components/shoe-bits";
import { Card } from "@/components/ui";
import { D } from "@/lib/decimal";
import { formatLKR, formatWear } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { getListing } from "@/server/catalogue";
import { shoeCurvePreview, shoePricing } from "@/server/catalogue/pricing";
import { getBundle } from "@/server/booking/bundle";
import { RentPanel } from "./rent-panel";

export async function generateMetadata({ params }: PageProps<"/shoes/[id]">): Promise<Metadata> {
  const shoe = await getListing((await params).id);
  return { title: shoe ? `${shoe.brand} ${shoe.model}` : "Shoe" };
}

export default async function ShoePage({ params }: PageProps<"/shoes/[id]">) {
  const { id } = await params;
  const [shoe, user, bundle] = await Promise.all([getListing(id), getCurrentUser(), getBundle()]);
  if (!shoe) notFound();
  const pricing = shoePricing(shoe);
  const preview = shoeCurvePreview(shoe);
  const [main, ...rest] = shoe.photos;

  return (
    <main className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-4">
        <PhotoImg
          id={main?.id}
          alt={`${shoe.brand} ${shoe.model}`}
          className="aspect-[4/3] w-full rounded-xl"
        />
        <div className="grid grid-cols-4 gap-3">
          {rest.map((p) => (
            <PhotoImg
              key={p.id}
              id={p.id}
              alt={`${p.kind.toLowerCase()} view`}
              className="aspect-square w-full rounded-lg"
            />
          ))}
        </div>
        <Card>
          <h2 className="mb-1 font-medium">How the price changes</h2>
          <p className="mb-3 text-sm text-subtle">
            You pay for the wear you add, at the price for the pair&apos;s age. The next borrower
            pays less.
          </p>
          <CurveChart points={preview.points} currentWear={shoe.wear.toString()} />
        </Card>
      </div>

      <aside className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {shoe.brand} {shoe.model}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-subtle">
            {shoe.size} · {shoe.category} · {shoe.merchant.businessName}
            <ShoeStatusBadge status={shoe.status} />
          </p>
        </div>
        <div>
          <span className="text-3xl font-semibold">{formatLKR(pricing.priceToday)}</span>
          <span className="text-subtle"> / wear-day today</span>
        </div>
        <div className="text-sm">
          <WearBar wear={shoe.wear.toString()} lifespan={shoe.lifespanDays} />
          <p className="mt-1 text-subtle">
            Worn {formatWear(shoe.wear.toString())} of {shoe.lifespanDays} wear-days ·{" "}
            {new D(pricing.lifeLeft).times(100).toFixed(0)}% of life left · grade{" "}
            {shoe.latestGrade ?? "—"}
          </p>
        </div>
        {shoe.description && <p className="text-sm">{shoe.description}</p>}
        <RentPanel
          shoeId={shoe.id}
          status={shoe.status}
          handoffTaken={shoe.rentalItems.length > 0}
          signedInAs={user?.role ?? null}
          inBundle={bundle.includes(shoe.id)}
        />
      </aside>
    </main>
  );
}
