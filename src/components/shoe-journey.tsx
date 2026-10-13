import type { CircularJourneyStory } from "@/lib/shoe-storytelling";

export function ShoeJourney({ journey }: { journey: CircularJourneyStory }) {
  return (
    <section
      aria-label="The shoe's circular lifecycle journey"
      className="rounded-2xl border border-line bg-paper/60 p-5 sm:p-6 backdrop-blur-md shadow-sm space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-line px-2.5 py-0.5 text-[11px] font-semibold text-subtle mb-1">
            <span className="size-1.5 rounded-full bg-good" />
            <span>100% Circular Footwear</span>
          </div>
          <h2 className="text-base font-bold tracking-tight text-ink sm:text-lg">
            The Shoe&apos;s Journey
          </h2>
          <p className="text-xs text-subtle">{journey.subheadline}</p>
        </div>

        {/* Circular metrics pill */}
        <div className="flex items-center gap-3 self-start sm:self-auto rounded-xl border border-line/60 bg-muted/40 px-3 py-2 text-xs">
          <div>
            <div className="font-extrabold text-ink">{journey.daysCirculated}</div>
            <div className="text-[10px] text-subtle">Days Shared</div>
          </div>
          <div className="h-6 w-px bg-line" />
          <div>
            <div className="font-extrabold text-good">~{journey.divertedCo2Kg} kg</div>
            <div className="text-[10px] text-subtle">CO₂ Diverted</div>
          </div>
        </div>
      </div>

      {/* Chapters Timeline */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {journey.chapters.map((chapter) => (
          <div
            key={chapter.number}
            className={`relative flex flex-col justify-between rounded-xl border p-4 space-y-2 transition-all ${
              chapter.highlight
                ? "border-accent/60 bg-accent/10 shadow-sm"
                : "border-line/60 bg-muted/30"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-subtle/80">{chapter.number}</span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  chapter.highlight
                    ? "border-accent text-ink bg-accent/30"
                    : "border-line text-subtle bg-paper/50"
                }`}
              >
                {chapter.status}
              </span>
            </div>

            <div>
              <h3 className="text-xs font-bold text-ink">{chapter.title}</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-subtle">
                {chapter.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Care & Hygiene Commitment */}
      <div className="flex items-center gap-2.5 rounded-xl border border-line/60 bg-muted/20 px-3.5 py-2.5 text-xs text-subtle">
        <span className="text-sm">🧼</span>
        <p className="text-[11px] leading-relaxed">
          {journey.careCommitment}
        </p>
      </div>
    </section>
  );
}
