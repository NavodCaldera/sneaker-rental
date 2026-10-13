import type { ShoePairingStory } from "@/lib/shoe-storytelling";

export function ShoeBestPaired({ story }: { story: ShoePairingStory }) {
  return (
    <section
      aria-label="Best paired for occasions and styling"
      className="rounded-2xl border border-line bg-paper/60 p-5 sm:p-6 backdrop-blur-md shadow-sm space-y-5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-accent" />
          <h2 className="text-base font-bold tracking-tight text-ink sm:text-lg">
            Best Paired For
          </h2>
        </div>
        <span className="text-xs font-medium text-subtle">Occasions · Terrain · Styling</span>
      </div>

      {/* Occasions grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {story.occasions.map((occ) => (
          <div
            key={occ.title}
            className="flex flex-col justify-between rounded-xl border border-line/60 bg-muted/40 p-3.5 transition-colors hover:border-accent/40"
          >
            <div className="space-y-1">
              <span className="text-lg" aria-hidden="true">
                {occ.icon}
              </span>
              <h3 className="text-xs font-semibold text-ink">{occ.title}</h3>
              <p className="text-[11px] leading-relaxed text-subtle">{occ.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Terrain & Environment */}
      <div className="flex items-start gap-3 rounded-xl border border-line/60 bg-muted/30 p-3.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-paper text-ink font-semibold text-xs border border-line">
          📍
        </div>
        <div className="space-y-0.5 text-xs">
          <div className="font-semibold text-ink">{story.terrain}</div>
          <p className="text-[11px] text-subtle">{story.terrainDetail}</p>
        </div>
      </div>

      {/* Stylist Note */}
      <div className="relative overflow-hidden rounded-xl border border-accent/30 bg-accent/10 p-4 space-y-1.5">
        <div className="flex items-center gap-2 text-xs font-bold text-ink">
          <span className="size-1.5 rounded-full bg-accent animate-pulse" />
          <span>Nova Stylist Tip</span>
        </div>
        <p className="text-xs leading-relaxed text-ink/90 italic">
          &ldquo;{story.stylingTip}&rdquo;
        </p>
      </div>
    </section>
  );
}
