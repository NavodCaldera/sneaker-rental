import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { Role } from "@/generated/prisma/enums";
import { RotationClosetSimulator, type RotationShoe } from "@/components/rotation-closet-simulator";
import { SizeOptions, sizeGuideHref } from "@/components/size-bits";
import { Button, Card, Select } from "@/components/ui";
import {
  CLOSET_COOKIE,
  closetSlotsFor,
  keepOffered,
  parseClosetDraft,
  startingPlan,
} from "@/lib/closet";
import { conditionShort } from "@/lib/shoe-condition";
import { shoeName } from "@/lib/shoe-name";
import { parseSize, sizeSummary } from "@/lib/shoe-size";
import { SHOP_AUDIENCES, parseShopAudience } from "@/lib/shoe-style";
import { colomboDay } from "@/lib/wear-ledger";
import { shoppingProfile } from "@/lib/borrower-profile";
import { colomboToday } from "@/server/auth/service";
import { getCurrentUser } from "@/server/auth/session";
import { getBundle } from "@/server/booking/bundle";
import { browseFacets, browseShoes } from "@/server/catalogue";
import { releaseInfo, shoePricing } from "@/server/catalogue/pricing";
import { getActiveSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: "Your Nova Closet",
  description: "Plan a rotation of pairs for your week and add it to your bundle.",
};

function one(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
}

export default async function ClosetPage({ searchParams }: PageProps<"/closet">) {
  const sp = await searchParams;
  const draft = parseClosetDraft((await cookies()).get(CLOSET_COOKIE)?.value);
  const [user, facets] = await Promise.all([getCurrentUser(), browseFacets()]);
  // The URL wins; with nothing in it, pick up the plan the visitor was working on, else a
  // customer's own size and who they are (their profile, product owner 2026-10-13).
  const profile = user?.role === "BORROWER" ? shoppingProfile(user, colomboToday()) : null;
  const fromUrl = one(sp.for) !== undefined || one(sp.size) !== undefined;
  const start = fromUrl
    ? { for: one(sp.for), size: one(sp.size) }
    : (draft ?? (profile && { for: profile.audience.toLowerCase(), size: profile.size }));
  const audience = parseShopAudience(start?.for);
  const size = start?.size ?? "";
  const sizeOk = parseSize(size) !== null;
  const ready = audience !== undefined && sizeOk;

  return (
    <main className="flex flex-col gap-6">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your Nova Closet</h1>
        <p className="mt-2 text-sm text-subtle">
          Pick a pair for each part of your week. You wear one pair a day, so the wear is shared
          across all of them, and the whole rotation costs about the same per day as one pair.
        </p>
      </header>

      <Card>
        <form
          key={`${audience}|${size}`}
          className="flex flex-wrap items-end gap-3"
          aria-label="Fit"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="closet-for" className="text-sm font-medium">
              Who it&apos;s for
            </label>
            <Select
              id="closet-for"
              name="for"
              defaultValue={audience?.toLowerCase() ?? ""}
              required
            >
              <option value="" disabled>
                Choose…
              </option>
              {SHOP_AUDIENCES.map((a) => (
                <option key={a.value} value={a.value.toLowerCase()}>
                  {a.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="closet-size" className="text-sm font-medium">
              Size
            </label>
            <Select id="closet-size" name="size" defaultValue={sizeOk ? size : ""} required>
              <option value="" disabled>
                Choose…
              </option>
              <SizeOptions sizes={facets.sizes} />
              {sizeOk && !Object.values(facets.sizes).flat().includes(size) && (
                <option>{size}</option>
              )}
            </Select>
          </div>
          <Button type="submit" variant={ready ? "secondary" : "primary"}>
            {ready ? "Update" : "Show pairs that fit"}
          </Button>
          <Link href={sizeGuideHref(sizeOk ? size : undefined)} className="py-2 text-sm underline">
            Size guide
          </Link>
        </form>
      </Card>

      {ready ? (
        <Planner audience={audience} size={size} draft={draft} role={user?.role ?? null} />
      ) : (
        <p className="text-sm text-subtle">
          Choose who the rotation is for and your size, and we&apos;ll show only pairs that fit.
        </p>
      )}
    </main>
  );
}

async function Planner({
  audience,
  size,
  draft,
  role,
}: {
  audience: NonNullable<ReturnType<typeof parseShopAudience>>;
  size: string;
  draft: ReturnType<typeof parseClosetDraft>;
  role: Role | null;
}) {
  const [shoes, active, bundle] = await Promise.all([
    browseShoes({ audience, size }),
    getActiveSettings(),
    getBundle(),
  ]);
  const today = colomboDay(new Date());
  const system = parseSize(size)?.system;

  const pairs: RotationShoe[] = shoes.map((shoe) => {
    const release = releaseInfo(shoe, active, today);
    const pricing = shoePricing(shoe, release.discount);
    return {
      id: shoe.id,
      name: shoeName(shoe),
      size: sizeSummary(shoe, system),
      value: shoe.value.toString(),
      priceToday: pricing.priceToday.toString(),
      experiences: shoe.experiences,
      photoId: shoe.photos[0]?.id,
      condition: shoe.condition === "NEW" ? null : conditionShort(shoe.condition),
    };
  });

  const tab = audience.toLowerCase();
  const offered = new Set(pairs.map((p) => p.id));
  const sameDraft = draft && draft.for === tab && draft.size === size && draft.slots.length > 0;
  const slots = sameDraft
    ? keepOffered(draft.slots, offered)
    : startingPlan(closetSlotsFor(audience), pairs, bundle);

  return (
    <RotationClosetSimulator
      // A new size or audience starts a fresh plan.
      key={`${tab}|${size}`}
      audienceTab={tab}
      size={size}
      pairs={pairs}
      initialSlots={slots}
      role={role}
      bundleIds={bundle}
    />
  );
}
