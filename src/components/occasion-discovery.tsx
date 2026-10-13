import Link from "next/link";
import { OCCASIONS, type OccasionMoment } from "@/lib/curated-packs";

function OccasionIcon({ kind }: { kind: OccasionMoment["iconKind"] }) {
  if (kind === "run") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 16l4-2 3 3 5-4" />
        <circle cx="17" cy="5" r="2" />
        <path d="M15 11l-3 3-2-2-4 3" />
      </svg>
    );
  }
  if (kind === "briefcase") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    );
  }
  if (kind === "coffee") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10 2v2" />
        <path d="M14 2v2" />
        <path d="M6 2v2" />
        <path d="M18 8a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-1" />
        <path d="M4 8h13v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </svg>
  );
}

export function OccasionDiscovery({
  currentExperience,
  audienceParam,
}: {
  currentExperience?: string;
  audienceParam?: string;
}) {
  return (
    <section aria-label="Arenas of character and presence" className="w-full">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
            Arenas of Character &amp; Presence
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {OCCASIONS.map((occ) => {
          const isActive = currentExperience === occ.experience;
          const href = audienceParam
            ? `/browse?for=${encodeURIComponent(audienceParam)}&experience=${encodeURIComponent(occ.experience)}`
            : `/browse?experience=${encodeURIComponent(occ.experience)}`;

          return (
            <Link
              key={occ.id}
              href={href}
              className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4.5 min-h-[190px] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isActive
                  ? "border-accent ring-2 ring-accent/60 shadow-lg scale-[1.01]"
                  : "border-line/70 hover:border-ink/50 hover:shadow-md"
              }`}
            >
              {/* Background Photo */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={occ.imageSrc}
                alt={occ.name}
                className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
              />

              {/* Gradient Overlay for high-contrast readability */}
              <div
                className={`absolute inset-0 transition-opacity duration-300 ${
                  isActive
                    ? "bg-gradient-to-t from-black/95 via-black/60 to-black/30"
                    : "bg-gradient-to-t from-black/90 via-black/50 to-black/20 group-hover:from-black/95 group-hover:via-black/55"
                }`}
              />

              {/* Top Bar with Icon and Active Pill */}
              <div className="relative z-10 flex items-start justify-between gap-3">
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl backdrop-blur-md transition-all duration-300 ${
                    isActive
                      ? "bg-accent text-on-accent shadow-md shadow-accent/25"
                      : "bg-black/45 text-white border border-white/20 group-hover:bg-accent group-hover:text-black group-hover:border-accent"
                  }`}
                >
                  <OccasionIcon kind={occ.iconKind} />
                </div>
                {isActive && (
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-on-accent shadow">
                    Active
                  </span>
                )}
              </div>

              {/* Bottom Info: Title */}
              <div className="relative z-10 mt-8">
                <div className="font-semibold text-white tracking-tight leading-snug group-hover:text-accent transition-colors">
                  {occ.name}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
