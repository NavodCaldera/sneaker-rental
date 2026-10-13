import Link from "next/link";
import { formatLKR } from "@/lib/format";
import { rotationBadge } from "@/lib/style-pack";
import type { PackView } from "@/server/packs";

/**
 * "Curated Transformation Blueprints" on the home page: published packs made by merchants
 * (approved by an admin) and admins, newest first. Each role lists the pairs that fill it.
 */
export function CuratedPacksShowcase({ packs }: { packs: PackView[] }) {
  if (packs.length === 0) return null;
  return (
    <section aria-label="Curated transformation blueprints" className="w-full">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
          Curated Transformation Blueprints
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {packs.map((pack) => (
          <article
            key={pack.id}
            aria-label={pack.title}
            className="flex flex-col justify-between rounded-3xl border border-line bg-paper p-6 shadow-sm transition-all hover:border-ink/30 hover:shadow-md"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-paper">
                  {rotationBadge(pack.roles.length)}
                </span>
              </div>

              <h3 className="mt-4 text-lg font-bold text-ink">{pack.title}</h3>
              {pack.subtitle && (
                <p className="mt-1 line-clamp-2 text-xs text-subtle">{pack.subtitle}</p>
              )}

              {(pack.highlight || pack.rotationDailyCost) && (
                <div className="mt-4 rounded-xl bg-muted p-3 text-xs text-ink/80">
                  {pack.highlight && (
                    <p>
                      <span className="font-semibold text-ink">Rotation Advantage: </span>
                      {pack.highlight}
                    </p>
                  )}
                  {pack.rotationDailyCost && (
                    <p className={pack.highlight ? "mt-1" : undefined}>
                      About {formatLKR(pack.rotationDailyCost)} per day held together
                    </p>
                  )}
                </div>
              )}

              <div className="mt-5 flex flex-col gap-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  Included Roles
                </div>
                {pack.roles.map((role, idx) => (
                  <div
                    key={role.id}
                    className="flex items-start gap-3 rounded-xl border border-line/60 bg-paper/80 p-3"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/30 text-xs font-bold text-ink">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="font-semibold text-ink">{role.name}</div>
                      {role.description && (
                        <div className="mt-0.5 text-subtle">{role.description}</div>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-ink/60">
                        {role.pairs.map((pair) => (
                          <span
                            key={pair.id}
                            className="rounded bg-muted px-1.5 py-0.5 font-medium"
                          >
                            {pair.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-line/60 pt-4">
              <Link
                href={`/packs/${pack.id}`}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                <span>Equip This Blueprint</span>
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
