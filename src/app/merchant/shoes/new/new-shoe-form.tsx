"use client";

import { useActionState, useEffect, useState } from "react";
import { CurveChart } from "@/components/curve-chart";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import type { CurvePreview } from "@/server/catalogue/pricing";
import { type ActionState, createShoeAction } from "../../actions";

/* eslint-disable @next/next/no-img-element -- local object-URL previews */

export function NewShoeForm({
  categories,
  photoSlots,
  lifespanMin,
  lifespanMax,
  monthsMin,
  monthsMax,
}: {
  categories: string[];
  photoSlots: { kind: string; label: string }[];
  lifespanMin: number;
  lifespanMax: number;
  monthsMin: number;
  monthsMax: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createShoeAction, {});
  const errors = state.fieldErrors ?? {};
  const [value, setValue] = useState("");
  const [lifespan, setLifespan] = useState("365");
  const preview = useCurvePreview(value, lifespan);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_minmax(0,420px)]">
      <div className="flex flex-col gap-6">
        {state.error && <Alert>{state.error}</Alert>}
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand" name="brand" error={errors.brand}>
            <Input name="brand" required />
          </Field>
          <Field label="Model" name="model" error={errors.model}>
            <Input name="model" required />
          </Field>
          <Field label="Size" name="size" error={errors.size}>
            <Input name="size" placeholder="UK 9" required />
          </Field>
          <Field label="Category" name="category" error={errors.category}>
            <Select name="category" defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description (optional)" name="description" error={errors.description}>
              <Textarea name="description" maxLength={1000} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Pickup address" name="pickupAddress" error={errors.pickupAddress}>
              <Input name="pickupAddress" required />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-medium">Photos</h2>
          <p className="mb-4 text-sm text-subtle">
            All five are required. They become the condition baseline for every rental. JPEG, PNG or
            WebP, up to 5 MB each.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {photoSlots.map(({ kind, label }) => (
              <label key={kind} className="flex cursor-pointer flex-col gap-1.5 text-sm">
                <span className="font-medium">{label}</span>
                <span className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-muted text-xs text-subtle">
                  {thumbs[kind] ? (
                    <img src={thumbs[kind]} alt="" className="size-full object-cover" />
                  ) : (
                    "Choose"
                  )}
                </span>
                <input
                  type="file"
                  name={`photo_${kind}`}
                  accept="image/jpeg,image/png,image/webp"
                  required
                  aria-label={`${label} photo`}
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setThumbs((t) => ({ ...t, [kind]: file ? URL.createObjectURL(file) : "" }));
                  }}
                />
              </label>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <h2 className="font-medium">Pricing inputs</h2>
          <Field
            label="Declared value (LKR)"
            name="value"
            error={errors.value}
            hint="What the pair is worth today"
          >
            <Input
              name="value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="6000"
              required
            />
          </Field>
          <Field
            label="Expected lifespan (wear-days)"
            name="lifespanDays"
            error={errors.lifespanDays}
            hint={`${lifespanMin}–${lifespanMax} wear-days (${monthsMin}–${monthsMax} months). Need longer? Ask us to extend your limit. Longer means a lower daily price and more rentals, but if the pair wears out early you lose the income it didn't collect.`}
          >
            <Input
              name="lifespanDays"
              type="number"
              min={lifespanMin}
              max={lifespanMax}
              value={lifespan}
              onChange={(e) => setLifespan(e.target.value)}
              required
            />
          </Field>
          <Field
            label="Wear already used (wear-days)"
            name="initialWear"
            error={errors.initialWear}
            hint="Leave empty for a new pair. For a pre-worn pair, the days it has been worn: rentals start further down the curve."
          >
            <Input name="initialWear" inputMode="decimal" placeholder="0" />
          </Field>
        </Card>

        <Card>
          <h2 className="mb-3 font-medium">Price curve</h2>
          {preview.data ? (
            <PreviewSummary preview={preview.data} />
          ) : (
            <p className="text-sm text-subtle">
              {preview.error ?? "Enter a value to see the curve."}
            </p>
          )}
        </Card>

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save draft"}
        </Button>
      </div>
    </form>
  );
}

function PreviewSummary({ preview }: { preview: CurvePreview }) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-subtle">New</dt>
          <dd className="font-medium">{formatLKR(preview.priceNew)} / wear-day</dd>
        </div>
        <div>
          <dt className="text-subtle">End of life</dt>
          <dd className="font-medium">{formatLKR(preview.priceEnd)} / wear-day</dd>
        </div>
        <div>
          <dt className="text-subtle">Borrowers pay in total</dt>
          <dd className="font-medium">{formatLKR(preview.lifetimeIncome)}</dd>
        </div>
        <div>
          <dt className="text-subtle">You earn over its life</dt>
          <dd className="font-medium">{formatLKR(preview.merchantShare)}</dd>
        </div>
      </dl>
      <CurveChart points={preview.points} height={200} />
    </div>
  );
}

function useCurvePreview(value: string, lifespan: string) {
  const [result, setResult] = useState<{ data?: CurvePreview; error?: string }>({});
  useEffect(() => {
    if (!value) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/pricing/preview?value=${encodeURIComponent(value)}&lifespan=${encodeURIComponent(lifespan)}`,
          { signal: ctrl.signal },
        );
        const body = await res.json();
        setResult(res.ok ? { data: body } : { error: body.error });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setResult({ error: "Couldn't load the preview" });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [value, lifespan]);
  return value ? result : {};
}
