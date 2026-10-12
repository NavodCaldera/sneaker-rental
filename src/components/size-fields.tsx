"use client";

import Link from "next/link";
import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import type { Audience, SizeSystem } from "@/generated/prisma/enums";
import {
  LISTING_SIZE_SYSTEMS,
  SIZE_KEY,
  chartFor,
  formatSize,
  normalizeSize,
  sizeRowFor,
} from "@/lib/shoe-size";

type Line = { key: number; size: string; quantity: string };

/**
 * The listing's stock (product owner, 2026-10-13): the size system on the labels, then one row
 * per size with how many pairs the merchant has of it. Each row says what borrowers see in the
 * other systems (from the chart for who it's for). Sent as repeated `stockSize` /
 * `stockQuantity` fields; every pair becomes its own listed pair.
 */
export function StockFields({
  audience,
  errors = {},
}: {
  /** Who it's for, chosen above; picks the chart */
  audience: Audience | "";
  errors?: Record<string, string[] | undefined>;
}) {
  const [system, setSystem] = useState<SizeSystem>("UK");
  const [lines, setLines] = useState<Line[]>([{ key: 0, size: "", quantity: "1" }]);
  const [nextKey, setNextKey] = useState(1);
  const chart = audience ? chartFor(audience) : null;
  const others = (["UK", "EU", "US", "CM"] as const).filter((s) => s !== system);

  const update = (key: number, change: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...change } : l)));
  const pairs = lines.reduce((n, l) => n + (Number.parseInt(l.quantity, 10) || 0), 0);
  const sizes = lines.filter((l) => l.size.trim()).length;

  function rowHint(size: string) {
    const number = /^\d{1,2}(\.\d)?$/.test(size.trim()) ? normalizeSize(size.trim()) : null;
    if (!number || !audience) return null;
    if (!chart) return "Kids' sizes are shown to borrowers as listed.";
    const row = sizeRowFor(audience, system, number);
    return row
      ? `Borrowers also see ${others.map((s) => formatSize(s, row[SIZE_KEY[s]])).join(" · ")}`
      : `Not on our ${chart.name.toLowerCase()} chart: shown only as ${formatSize(system, number)}`;
  }

  const stockError = errors.stock?.[0];
  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Size system"
          name="sizeSystem"
          error={errors.sizeSystem}
          hint={
            <>
              The sizes printed on the labels.{" "}
              <Link href="/size-guide" target="_blank" className="underline">
                Size guide
              </Link>
            </>
          }
        >
          <Select
            name="sizeSystem"
            value={system}
            onChange={(e) => setSystem(e.target.value as SizeSystem)}
          >
            {LISTING_SIZE_SYSTEMS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Pairs in each size</legend>
        <p className="-mt-1 text-xs text-subtle">
          How many pairs you have of each size. Each pair is rented, worn and priced on its own.
          {!audience && " Choose who it's for to see each size in the other systems."}
        </p>
        <ul className="flex flex-col gap-2">
          {lines.map((line, i) => {
            const hint = rowHint(line.size);
            return (
              <li key={line.key} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Input
                    name="stockSize"
                    id={`stockSize-${line.key}`}
                    aria-label={`Size ${i + 1}`}
                    inputMode="decimal"
                    list="size-suggestions"
                    placeholder={`${system} size`}
                    value={line.size}
                    onChange={(e) => update(line.key, { size: e.target.value })}
                    className="w-32"
                    required
                  />
                  <span aria-hidden="true" className="text-subtle">
                    ×
                  </span>
                  <Input
                    name="stockQuantity"
                    id={`stockQuantity-${line.key}`}
                    aria-label={`Pairs of size ${i + 1}`}
                    type="number"
                    min={1}
                    max={20}
                    step={1}
                    value={line.quantity}
                    onChange={(e) => update(line.key, { quantity: e.target.value })}
                    className="w-20"
                    required
                  />
                  <span className="text-sm text-subtle">pairs</span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                      aria-label={`Remove size ${i + 1}`}
                      className="ml-auto rounded-full px-2 text-lg leading-none text-subtle hover:text-ink"
                    >
                      ×
                    </button>
                  )}
                </div>
                {hint && <p className="text-xs text-subtle">{hint}</p>}
              </li>
            );
          })}
        </ul>
        <datalist id="size-suggestions">
          {chart?.rows.map((r) => (
            <option key={r.uk} value={r[SIZE_KEY[system]]} />
          ))}
        </datalist>
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => {
              setLines((ls) => [...ls, { key: nextKey, size: "", quantity: "1" }]);
              setNextKey((k) => k + 1);
            }}
            className="font-medium underline"
          >
            Add another size
          </button>
          <span className="text-subtle" aria-live="polite">
            {pairs} {pairs === 1 ? "pair" : "pairs"} in {sizes} {sizes === 1 ? "size" : "sizes"}
          </span>
        </div>
        {stockError && (
          <p className="text-xs font-medium text-ink" role="alert">
            {stockError}
          </p>
        )}
      </fieldset>
    </div>
  );
}
