import type { Metadata } from "next";
import { BackButton } from "@/components/back-button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addPackToBundleAction } from "@/app/packs/actions";
import { addToBundleAction } from "@/app/rentals/actions";
import { PhotoImg } from "@/components/shoe-bits";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { toD } from "@/lib/decimal";
import { formatLKR } from "@/lib/format";
import { PACK_STATUS, rotationBadge } from "@/lib/style-pack";
import { getCurrentUser } from "@/server/auth/session";
import { getBundle } from "@/server/booking/bundle";
import { packForViewer } from "@/server/packs";

export const metadata: Metadata = { title: "Style pack" };

/**
 * A style pack's page: its roles and the listed pairs that fill them, with today's price per
 * day. A borrower can add one pair per role to their bundle in one go, or single pairs.
 * Unpublished packs are visible only to their maker and admins (a preview).
 */
export default async function PackPage({ params }: PageProps<"/packs/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  const pack = await packForViewer(id, user);
  if (!pack) notFound();
  const borrower = user?.role === "BORROWER";
  const bundle = borrower ? new Set(await getBundle()) : new Set<string>();
  const anyBookable = pack.roles.some((r) => r.pairs.some((p) => p.bookable));

  return (
    <main className="flex flex-col gap-6">
      <BackButton href="/" to="the home page" useHistory />
      {pack.status !== "PUBLISHED" && (
        <Alert tone="info">
          Preview: this pack is {PACK_STATUS[pack.status].label.toLowerCase()}, so borrowers
          can&apos;t see it yet.
        </Alert>
      )}
      <header className="flex flex-col gap-2">
        <span className="self-start rounded-full bg-ink px-3 py-1 text-xs font-semibold text-paper">
          {rotationBadge(pack.roles.length)}
        </span>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{pack.title}</h1>
      </header>

      {(borrower ? anyBookable : !user) && (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          {borrower ? (
            anyBookable && (
              <form action={addPackToBundleAction.bind(null, pack.id)}>
                <Button>Add the rotation to my bundle</Button>
              </form>
            )
          ) : !user ? (
            <p className="text-sm">
              <Link href="/sign-in" className="underline">
                Sign in
              </Link>{" "}
              to rent this rotation.
            </p>
          ) : null}
        </Card>
      )}

      <ol className="flex flex-col gap-6">
        {pack.roles.map((role, i) => (
          <li key={role.id} className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent">
                {i + 1}
              </span>
              <div>
                <h2 className="font-semibold">{role.name}</h2>
                {role.description && <p className="text-sm text-subtle">{role.description}</p>}
                {role.experience && (
                  <div className="mt-1">
                    <Badge>{role.experience}</Badge>
                  </div>
                )}
              </div>
            </div>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {role.pairs.map((pair) => (
                <li key={pair.id} className="flex flex-col gap-2">
                  <Link href={`/shoes/${pair.id}`} className="group flex flex-col gap-2">
                    <PhotoImg
                      id={pair.photoId}
                      alt=""
                      className="aspect-square w-full rounded-2xl transition group-hover:brightness-95"
                    />
                    <span className="text-sm leading-snug">
                      <span className="block truncate font-semibold">{pair.name}</span>
                      <span className="block text-subtle">{pair.size}</span>
                      <span className="block">
                        <span className="font-semibold">{formatLKR(pair.priceToday)}</span>
                        <span className="text-subtle"> per day</span>
                      </span>
                      <span className="block text-xs text-subtle">
                        Condition {toD(pair.lifeLeft).times(100).toFixed(0)}%
                        {!pair.bookable && " · not available now"}
                      </span>
                    </span>
                  </Link>
                  {borrower &&
                    pair.bookable &&
                    (bundle.has(pair.id) ? (
                      <span className="text-xs text-subtle">In your bundle</span>
                    ) : (
                      <form action={addToBundleAction.bind(null, pair.id)}>
                        <Button
                          variant="secondary"
                          className="w-full"
                          aria-label={`Add ${pair.name} to bundle`}
                        >
                          Add to bundle
                        </Button>
                      </form>
                    ))}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </main>
  );
}
