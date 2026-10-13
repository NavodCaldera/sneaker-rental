import type { WearBarometerStory } from "@/lib/shoe-storytelling";

export function ShoeValueBarometer({ barometer }: { barometer: WearBarometerStory }) {
  return (
    <section
      aria-label="Wear-curve value barometer"
      className="rounded-2xl border border-line bg-paper/60 p-5 backdrop-blur-md shadow-sm space-y-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
            <span className="size-2 rounded-full bg-accent" />
            <span>Value & Comfort Barometer</span>
          </div>
          <p className="text-[11px] text-subtle">
            How seasoned wear unlocks peak broken-in ergonomics
          </p>
        </div>
        <div className="rounded-full border border-accent/40 bg-accent/15 px-2.5 py-1 text-[11px] font-bold text-ink">
          {barometer.valueAdvantage}
        </div>
      </div>

      {/* Visual Barometer Segments */}
      <div className="space-y-1.5">
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted border border-line/60 flex">
          {/* Phase 1: Factory Fresh (0-15%) */}
          <div
            style={{ width: "15%" }}
            className={`h-full border-r border-line/40 transition-colors ${
              barometer.phase === "fresh" ? "bg-ink/80" : "bg-muted/60"
            }`}
            title="Factory Fresh (0–15%)"
          />
          {/* Phase 2: Golden Sweet Spot (15-60%) */}
          <div
            style={{ width: "45%" }}
            className={`h-full border-r border-line/40 transition-colors ${
              barometer.phase === "sweet-spot" ? "bg-accent" : "bg-accent/30"
            }`}
            title="The Golden Sweet Spot (15–60%)"
          />
          {/* Phase 3: Seasoned Veteran (60-100%) */}
          <div
            style={{ width: "40%" }}
            className={`h-full transition-colors ${
              barometer.phase === "seasoned" ? "bg-ink/70" : "bg-muted/40"
            }`}
            title="Seasoned Veteran (60–100%)"
          />

          {/* Current Position Marker */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-ink shadow-md z-10 -ml-0.5"
            style={{ left: `${Math.min(98, Math.max(2, barometer.wearPercent))}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 size-2 rounded-full bg-accent border border-ink" />
          </div>
        </div>

        {/* Labels below bar */}
        <div className="flex justify-between text-[10px] text-subtle">
          <span>Factory Fresh</span>
          <span className="font-semibold text-accent">★ Golden Sweet Spot</span>
          <span>Seasoned</span>
        </div>
      </div>

      {/* Barometer Insight Box */}
      <div className="rounded-xl border border-line/60 bg-muted/40 p-3.5 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-bold text-ink">{barometer.phaseLabel}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-subtle">Comfort Index:</span>
            <span className="font-extrabold text-accent">
              {barometer.comfortIndex}/100
            </span>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-subtle">
          {barometer.summary}
        </p>
        <div className="rounded-lg bg-paper/60 p-2 text-[11px] text-ink/90 border border-line/40">
          <strong>Ergonomic feel:</strong> {barometer.comfortNote}
        </div>
      </div>
    </section>
  );
}
