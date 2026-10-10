"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { type SettingsState, saveSettingsAction } from "./actions";

type Values = Record<string, string | boolean>;

const GROUPS: { title: string; fields: { name: string; label: string; hint?: string }[] }[] = [
  {
    title: "Margins (OPEN DECISION: the split of the 20%)",
    fields: [
      { name: "merchantMargin", label: "Merchant margin μm", hint: "0.10 = 10%" },
      { name: "platformMargin", label: "Platform margin μp", hint: "0.10 = 10%" },
    ],
  },
  {
    title: "Price curve",
    fields: [
      { name: "floor", label: "Floor q", hint: "End-of-life price as a share of new (0.30)" },
      { name: "midpointRatio", label: "Midpoint ratio", hint: "200 / 365 = 0.5479…" },
      { name: "baseSteepness", label: "Base steepness", hint: "At the reference lifespan (0.03)" },
      {
        name: "refLife",
        label: "Reference lifespan",
        hint: "Wear-days the base curve was tuned for (365)",
      },
    ],
  },
  {
    title: "Listings (OPEN DECISION: lifespan limits)",
    fields: [
      { name: "minLifespanDays", label: "Shortest lifespan (wear-days)", hint: "60" },
      { name: "maxLifespanDays", label: "Longest lifespan (wear-days)", hint: "1095" },
    ],
  },
  {
    title: "Idle discounts (Phase 2)",
    fields: [
      { name: "idleDiscountCap", label: "Idle discount cap", hint: "0.05 = 5%" },
      {
        name: "capitalRate",
        label: "Capital rate r",
        hint: "Yearly, for the idle-cost test (0.12)",
      },
      { name: "holdCost", label: "Hold cost h (LKR per idle day)", hint: "0" },
    ],
  },
  {
    title: "Rentals",
    fields: [
      { name: "depositPerPair", label: "Deposit per pair (LKR)" },
      { name: "maxPairsPerBundle", label: "Max pairs held at once" },
      { name: "disputeWindowDays", label: "Dispute window (days)" },
      { name: "freeReturnHours", label: "Free return window (hours)" },
      {
        name: "deliveryBookingFee",
        label: "Delivery booking fee (LKR)",
        hint: "OPEN DECISION: leave empty until decided",
      },
    ],
  },
];

export function SettingsForm({ values }: { values: Values }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="good">{state.ok}</Alert>}
      {GROUPS.map((g) => (
        <fieldset key={g.title} className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">{g.title}</legend>
          {g.fields.map((f) => (
            <Field key={f.name} label={f.label} name={f.name} hint={f.hint} error={errors[f.name]}>
              <Input name={f.name} defaultValue={String(values[f.name] ?? "")} />
            </Field>
          ))}
        </fieldset>
      ))}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="catchUpEnabled"
          defaultChecked={values.catchUpEnabled === true}
          className="mt-0.5"
        />
        <span>
          <strong>Catch-up pricing (φ).</strong> Raise later prices so a discounted pair still
          reaches R. Off at launch: discounts come out of the margin. (OPEN DECISION)
        </span>
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        Save new version
      </Button>
    </form>
  );
}
