import Link from "next/link";
import { CURATED_PACKS } from "@/lib/curated-packs";

export function CuratedPacksShowcase() {
  return (
    <section aria-label="Curated rotations" className="w-full">
      <div className="mb-6 flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
            Curated Rotations &amp; Style Packs
          </h2>
          <span className="rounded-full bg-accent/25 px-2.5 py-0.5 text-xs font-semibold text-ink">
            Wear-Sharing Engine
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {CURATED_PACKS.map((pack) => (
          <div
            key={pack.id}
            className="flex flex-col justify-between rounded-3xl border border-line bg-paper p-6 shadow-sm transition-all hover:border-ink/30 hover:shadow-md"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-paper">
                  {pack.badge}
                </span>
                <span className="text-xs font-medium text-subtle">
                  {pack.pairsCount} pairs rotating
                </span>
              </div>

              <h3 className="mt-4 text-lg font-bold text-ink">
                {pack.title}
              </h3>
              <p className="mt-1 text-xs text-subtle line-clamp-2">
                {pack.subtitle}
              </p>

              <div className="mt-4 rounded-xl bg-muted p-3 text-xs text-ink/80">
                <span className="font-semibold text-ink">Rotation Advantage: </span>
                {pack.highlight}
              </div>

              <div className="mt-5 flex flex-col gap-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  Included Roles
                </div>
                {pack.slots.map((slot, idx) => (
                  <div
                    key={slot.role}
                    className="flex items-start gap-3 rounded-xl border border-line/60 bg-paper/80 p-3"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/30 text-xs font-bold text-ink">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="font-semibold text-ink">{slot.role}</div>
                      <div className="text-subtle mt-0.5">{slot.description}</div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-ink/60">
                        {slot.suggestedStyles.map((style) => (
                          <span
                            key={style}
                            className="rounded bg-muted px-1.5 py-0.5 font-medium"
                          >
                            {style}
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
                href={pack.browseHref}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                <span>Explore This Rotation</span>
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
