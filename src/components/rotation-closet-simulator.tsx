"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { addRotationToBundleAction } from "@/app/rentals/actions";
import { D } from "@/lib/decimal";
import { formatLKR } from "@/lib/format";
import { bundleDailyCost } from "@/lib/pricing";
import {
  CLOSET_COOKIE,
  type ClosetSlot,
  MAX_CLOSET_SLOTS,
  placePair,
  slotTitle,
} from "@/lib/closet";
import type { Role } from "@/generated/prisma/enums";
import { PhotoImg } from "./shoe-bits";
import { Badge, Button, Input, cx } from "./ui";

/** A pair offered in the picked size, priced on the server by the engine. */
export type RotationShoe = {
  id: string;
  name: string;
  /** "UK 9 · EU 43" */
  size: string;
  /** Retail value V, a decimal string */
  value: string;
  /** Today's price per day P(w), after any release discount, a decimal string */
  priceToday: string;
  experiences: string[];
  photoId?: string;
  /** Condition label, or null for a new pair */
  condition: string | null;
};

const pairsLabel = (n: number) => `${n} ${n === 1 ? "pair" : "pairs"}`;

/** Saves the draft plan for the page to restore (a reload, coming back after sign-in). */
function saveDraft(audienceTab: string, size: string, slots: ClosetSlot[]) {
  try {
    const value = encodeURIComponent(JSON.stringify({ for: audienceTab, size, slots }));
    document.cookie = `${CLOSET_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  } catch {
    // Cookies blocked: the plan just isn't remembered.
  }
}

export function RotationClosetSimulator({
  audienceTab,
  size,
  pairs,
  initialSlots,
  role,
  bundleIds,
}: {
  audienceTab: string;
  size: string;
  pairs: RotationShoe[];
  initialSlots: ClosetSlot[];
  role: Role | null;
  bundleIds: string[];
}) {
  const [slots, setSlotsState] = useState(initialSlots);
  // The slot the borrower is choosing a pair for, if any.
  const [target, setTarget] = useState<number | null>(null);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const shelfId = useId();

  const setSlots = (next: ClosetSlot[]) => {
    setSlotsState(next);
    saveDraft(audienceTab, size, next);
  };

  const byId = new Map(pairs.map((p) => [p.id, p]));
  const chosen = slots.flatMap((s) =>
    s.shoeId && byId.has(s.shoeId) ? [byId.get(s.shoeId)!] : [],
  );
  const n = chosen.length;
  // Engine output: each pair's P(w) for 1/n of a day's wear.
  const dailyCost = bundleDailyCost(chosen.map((p) => p.priceToday));
  const retailValue = chosen.reduce((sum, p) => sum.plus(p.value), new D(0));
  const newToBundle = chosen.filter((p) => !bundleIds.includes(p.id)).length;

  const experiences = [...new Set(pairs.flatMap((p) => p.experiences))];
  const q = query.trim().toLowerCase();
  const shown = pairs.filter(
    (p) => (filter === "All" || p.experiences.includes(filter)) && p.name.toLowerCase().includes(q),
  );

  const scrollToShelf = () =>
    document.getElementById(shelfId)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const chooseFor = (index: number) => {
    setTarget(index);
    const exp = slots[index].experience;
    setFilter(exp && experiences.includes(exp) ? exp : "All");
    scrollToShelf();
  };

  const add = (pair: RotationShoe) => {
    setSlots(placePair(slots, pair, target ?? undefined));
    setTarget(null);
  };

  const removePair = (shoeId: string) =>
    setSlots(slots.map((s) => (s.shoeId === shoeId ? { ...s, shoeId: null } : s)));

  const removeSlot = (index: number) => {
    setSlots(slots.filter((_, i) => i !== index));
    setTarget(null);
  };

  const addSlot = () => {
    const next = [...slots, { experience: null, shoeId: null }];
    setSlots(next);
    chooseFor(next.length - 1);
  };

  const addToBundle = () =>
    startTransition(async () => {
      await addRotationToBundleAction(chosen.map((p) => p.id));
    });

  const targetTitle = target !== null && slots[target] ? slotTitle(slots[target]) : null;

  return (
    <div className="flex flex-col gap-8">
      {/* The rotation */}
      <section aria-labelledby="rotation-heading" className="flex flex-col gap-3">
        <h2 id="rotation-heading" className="text-lg font-semibold">
          Your rotation
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {slots.map((slot, i) => {
            const pair = slot.shoeId ? byId.get(slot.shoeId) : undefined;
            const title = slotTitle(slot);
            const choosing = target === i;
            return (
              <li
                key={i}
                className={cx(
                  "flex flex-col gap-3 rounded-xl border p-3",
                  pair ? "border-line bg-paper" : "border-dashed border-line",
                  choosing && "border-solid border-ink ring-2 ring-ink",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  {choosing && <Badge tone="info">Choosing</Badge>}
                </div>
                {pair ? (
                  <div className="flex gap-3 sm:flex-col">
                    <PhotoImg
                      id={pair.photoId}
                      alt=""
                      className="aspect-square w-24 shrink-0 rounded-lg object-cover sm:w-full"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                      <Link href={`/shoes/${pair.id}`} className="font-medium hover:underline">
                        {pair.name}
                      </Link>
                      <span className="text-xs text-subtle">{pair.size}</span>
                      <span>
                        <span className="font-semibold">{formatLKR(pair.priceToday)}</span>
                        <span className="text-subtle"> per day</span>
                      </span>
                      {pair.condition && (
                        <span>
                          <Badge>{pair.condition}</Badge>
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => (choosing ? setTarget(null) : chooseFor(i))}
                    aria-label={
                      choosing ? `Stop choosing for ${title}` : `Choose a pair for ${title}`
                    }
                    className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg bg-muted text-sm font-medium hover:bg-line sm:aspect-square sm:h-auto"
                  >
                    <span aria-hidden="true" className="text-2xl leading-none">
                      +
                    </span>
                    {choosing ? "Pick one below" : "Choose a pair"}
                  </button>
                )}
                <div className="mt-auto flex flex-wrap gap-2 empty:hidden">
                  {choosing && pair ? (
                    <Button type="button" variant="ghost" onClick={() => setTarget(null)}>
                      Cancel
                    </Button>
                  ) : pair ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => chooseFor(i)}
                      aria-label={`Change the pair for ${title}`}
                    >
                      Change
                    </Button>
                  ) : null}
                  {pair && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removePair(pair.id)}
                      aria-label={`Remove ${pair.name} from ${title}`}
                    >
                      Remove
                    </Button>
                  )}
                  {!pair && slot.experience === null && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removeSlot(i)}
                      aria-label={`Remove this ${title.toLowerCase()} slot`}
                    >
                      Remove slot
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
          {slots.length < MAX_CLOSET_SLOTS && (
            <li>
              <button
                type="button"
                onClick={addSlot}
                className="flex size-full min-h-24 items-center justify-center rounded-xl border border-dashed border-line p-3 text-sm font-medium hover:border-ink hover:bg-muted"
              >
                + Add another pair
              </button>
            </li>
          )}
        </ul>
      </section>

      {/* Pairs that fit */}
      <section
        id={shelfId}
        aria-labelledby="shelf-heading"
        className="flex scroll-mt-24 flex-col gap-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="shelf-heading" className="text-lg font-semibold">
            {targetTitle ? `Choose a pair for ${targetTitle}` : "Pairs in your size"}
          </h2>
          {targetTitle && (
            <button type="button" onClick={() => setTarget(null)} className="text-sm underline">
              Cancel
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search brand or model"
            aria-label="Search pairs"
            className="sm:w-64"
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by experience">
            {["All", ...experiences].map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={filter === x}
                onClick={() => setFilter(x)}
                className={cx(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  filter === x ? "border-ink bg-ink text-paper" : "border-line hover:border-ink",
                )}
              >
                {x}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-subtle">
            {pairs.length === 0
              ? "No pairs in this size right now. Try another size."
              : "No pairs match. Try All or another search."}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {shown.map((pair) => {
              const inSlot = slots.findIndex((s) => s.shoeId === pair.id);
              return (
                <li key={pair.id} className="flex flex-col gap-2 rounded-xl border border-line p-2">
                  <div className="relative">
                    <PhotoImg
                      id={pair.photoId}
                      alt=""
                      className="aspect-square w-full rounded-lg"
                    />
                    {pair.condition && (
                      <span className="absolute left-1.5 top-1.5">
                        <Badge>{pair.condition}</Badge>
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 text-sm">
                    <Link href={`/shoes/${pair.id}`} className="font-medium hover:underline">
                      {pair.name}
                    </Link>
                    <span className="text-xs text-subtle">{pair.size}</span>
                    <span>
                      <span className="font-semibold">{formatLKR(pair.priceToday)}</span>
                      <span className="text-subtle"> per day</span>
                    </span>
                  </div>
                  {inSlot >= 0 && target === null ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-center text-xs font-medium">
                        In your rotation: {slotTitle(slots[inSlot])}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => removePair(pair.id)}
                        aria-label={`Remove ${pair.name} from your rotation`}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => add(pair)}
                      aria-label={`Add ${pair.name} to ${targetTitle ?? "your rotation"}`}
                    >
                      {targetTitle ? `Add to ${targetTitle}` : "Add"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Summary: sticks to the bottom of the screen while planning */}
      <section
        aria-label="Rotation summary"
        className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite" className="text-sm">
            {n === 0 ? (
              <p>Your rotation is empty.</p>
            ) : (
              <>
                <p>
                  <span className="font-semibold">{pairsLabel(n)}</span> ·{" "}
                  <span className="font-semibold">about {formatLKR(dailyCost)} per day</span>{" "}
                  together
                  <span className="hidden sm:inline"> · retail value {formatLKR(retailValue)}</span>
                </p>
                <p className="hidden text-xs text-subtle sm:block">
                  {n === 1
                    ? "Add more pairs: the wear is shared between them, so the daily cost stays about the same."
                    : `You wear one pair a day, so each is worn about 1 day in ${n}.`}
                </p>
              </>
            )}
          </div>
          <RotationAction
            role={role}
            n={n}
            newToBundle={newToBundle}
            bundleCount={bundleIds.length}
            pending={pending}
            onAdd={addToBundle}
          />
        </div>
      </section>
    </div>
  );
}

function RotationAction({
  role,
  n,
  newToBundle,
  bundleCount,
  pending,
  onAdd,
}: {
  role: Role | null;
  n: number;
  newToBundle: number;
  bundleCount: number;
  pending: boolean;
  onAdd: () => void;
}) {
  if (role === null) {
    return (
      <Link
        href="/sign-in?next=/closet"
        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:opacity-90"
      >
        Sign in to rent these pairs
      </Link>
    );
  }
  if (role !== "BORROWER") {
    return <p className="text-xs text-subtle">Only borrower accounts can rent pairs.</p>;
  }
  return (
    <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
      <Button type="button" onClick={onAdd} disabled={n === 0 || newToBundle === 0 || pending}>
        {pending
          ? "Adding…"
          : n > 0 && newToBundle === 0
            ? "All in your bundle"
            : `Add ${pairsLabel(newToBundle)} to my bundle`}
      </Button>
      {bundleCount > 0 && newToBundle > 0 && (
        <span className="text-xs text-subtle">
          Your bundle keeps its {pairsLabel(bundleCount)}; these are added to it.
        </span>
      )}
    </div>
  );
}
