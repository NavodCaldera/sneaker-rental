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

/**
 * The size on the pair's label: its system (UK, EU or US) and number, suggested from the chart
 * for who it's for, with the same size in the other systems as borrowers will see it.
 */
export function SizeFields({
  audience,
  errors = {},
}: {
  /** Who it's for, chosen above; picks the chart */
  audience: Audience | "";
  errors?: Record<string, string[] | undefined>;
}) {
  const [system, setSystem] = useState<SizeSystem>("UK");
  const [value, setValue] = useState("");
  const chart = audience ? chartFor(audience) : null;
  const number = /^\d{1,2}(\.\d)?$/.test(value.trim()) ? normalizeSize(value.trim()) : null;
  const row = audience && number ? sizeRowFor(audience, system, number) : null;
  const others = (["UK", "EU", "US", "CM"] as const).filter((s) => s !== system);

  let hint: React.ReactNode = "The size printed on the label inside the shoe.";
  if (!audience) hint = "Choose to whom to see it in the other sizes.";
  else if (!chart) hint = "Kids' sizes are shown to borrowers as listed.";
  else if (row)
    hint = `Borrowers also see ${others.map((s) => formatSize(s, row[SIZE_KEY[s]])).join(" · ")} (${chart.name.toLowerCase()} chart).`;
  else if (number)
    hint = `${formatSize(system, number)} isn't on our ${chart.name.toLowerCase()} chart: borrowers will see it only as listed.`;

  return (
    <>
      <Field label="Size system" name="sizeSystem" error={errors.sizeSystem}>
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
      <Field
        label="Size"
        name="size"
        error={errors.size}
        hint={
          <>
            {hint}{" "}
            <Link href="/size-guide" target="_blank" className="underline">
              Size guide
            </Link>
          </>
        }
      >
        <Input
          name="size"
          inputMode="decimal"
          list="size-suggestions"
          placeholder={
            chart ? chart.rows[Math.floor(chart.rows.length / 2)][SIZE_KEY[system]] : "9"
          }
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
        />
        <datalist id="size-suggestions">
          {chart?.rows.map((r) => (
            <option key={r.uk} value={r[SIZE_KEY[system]]} />
          ))}
        </datalist>
      </Field>
    </>
  );
}
