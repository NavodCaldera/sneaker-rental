"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { CurveChart } from "@/components/curve-chart";
import { PricingMethodFields } from "@/components/pricing-method-fields";
import { SizeFields } from "@/components/size-fields";
import { StyleFields } from "@/components/style-fields";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import type { Audience, PricingMethod } from "@/generated/prisma/enums";
import type { CurvePreview } from "@/server/catalogue/pricing";
import { formatLKR } from "@/lib/format";
import { SHOE_CONDITIONS } from "@/lib/shoe-condition";
import {
  type ActionState,
  createShoeAction,
  requestLifespanExtensionAction,
} from "../../actions";

/* eslint-disable @next/next/no-img-element -- local object-URL previews */

export function NewShoeForm({
  photoSlots,
  lifespanMin,
  lifespanMax,
  monthsMin,
  monthsMax,
  pickupAddress,
  floorPercent,
}: {
  photoSlots: { kind: string; label: string }[];
  lifespanMin: number;
  lifespanMax: number;
  monthsMin: number;
  monthsMax: number;
  /** The merchant's one address: every pair is picked up from and returned to it */
  pickupAddress: string | null;
  /** End-of-life price as a percentage of the new price (settings floor q) */
  floorPercent: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createShoeAction, {});
  const errors = state.fieldErrors ?? {};
  const [value, setValue] = useState("");
  const [lifespan, setLifespan] = useState("365");
  const [condition, setCondition] = useState("NEW");
  const [audience, setAudience] = useState<Audience | "">("");
  const [method, setMethod] = useState<PricingMethod>("LOGISTIC");
  const preview = useCurvePreview(value, lifespan, method);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [requestingExtension, setRequestingExtension] = useState(false);
  const [extensionRequested, setExtensionRequested] = useState<string | null>(null);

  async function handleRequestExtension() {
    setRequestingExtension(true);
    try {
      const res = await requestLifespanExtensionAction();
      if (res.ok) {
        setExtensionRequested(res.ok);
      } else {
        setExtensionRequested(res.error || "Failed to send request");
      }
    } catch {
      setExtensionRequested("Failed to send request");
    } finally {
      setRequestingExtension(false);
    }
  }

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_minmax(0,420px)]">
      <div className="flex flex-col gap-6">
        {state.error && <Alert>{state.error}</Alert>}
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand (optional)" name="brand" error={errors.brand}>
            <Input name="brand" />
          </Field>
          <Field label="Model (optional)" name="model" error={errors.model}>
            <Input name="model" />
          </Field>
          <StyleFields errors={errors} onAudienceChange={setAudience} />
          <SizeFields audience={audience} errors={errors} />
          <div className="sm:col-span-2">
            <Field label="Description (optional)" name="description" error={errors.description}>
              <Textarea name="description" maxLength={1000} />
            </Field>
          </div>
          <div className="text-sm sm:col-span-2">
            <div className="font-medium">Picked up from and returned to</div>
            {pickupAddress ? (
              <p className="whitespace-pre-line text-subtle">{pickupAddress}</p>
            ) : (
              <Alert>Add your pickup address in your account before listing.</Alert>
            )}
            <Link href="/merchant/account" className="text-xs underline">
              {pickupAddress ? "Change address" : "Add address"}
            </Link>
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
          <Field label="Price" name="value" error={errors.value}>
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
            label="Expected lifespan (days)"
            name="lifespanDays"
            error={errors.lifespanDays}
            hint={
              <span className="flex flex-wrap items-center gap-1.5">
                <span>
                  {lifespanMin}–{lifespanMax} days ({monthsMin}–{monthsMax} months).
                </span>
                {extensionRequested ? (
                  <span className="font-medium text-good">{extensionRequested}</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleRequestExtension}
                    disabled={requestingExtension}
                    className="font-medium underline hover:text-ink cursor-pointer disabled:opacity-50"
                  >
                    {requestingExtension ? "Sending request…" : "Need longer?"}
                  </button>
                )}
              </span>
            }
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
            label="Condition"
            name="condition"
            error={errors.condition}
            hint="Shown to borrowers on the listing."
          >
            <Select
              name="condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              {SHOE_CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          {condition !== "NEW" && (
            <Field
              label="Wear already used (days)"
              name="initialWear"
              error={errors.initialWear}
              hint="The days it has been worn. Rentals start further down the curve, so the daily price is lower."
            >
              <Input name="initialWear" inputMode="decimal" placeholder="e.g. 60" required />
            </Field>
          )}
          {condition === "SECOND_HAND_UPGRADED" && (
            <Field
              label="What was upgraded"
              name="upgradeNotes"
              error={errors.upgradeNotes}
              hint="E.g. new insoles and laces, sole regrip, professional clean."
            >
              <Textarea name="upgradeNotes" maxLength={300} required />
            </Field>
          )}
          <PricingMethodFields
            value={method}
            onChange={setMethod}
            floorPercent={floorPercent}
            error={errors.pricingMethod}
          />
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
          <dd className="font-medium">{formatLKR(preview.priceNew)} per day</dd>
        </div>
        <div>
          <dt className="text-subtle">End of life</dt>
          <dd className="font-medium">{formatLKR(preview.priceEnd)} per day</dd>
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

function useCurvePreview(value: string, lifespan: string, method: PricingMethod) {
  const [result, setResult] = useState<{ data?: CurvePreview; error?: string }>({});
  useEffect(() => {
    if (!value) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/pricing/preview?value=${encodeURIComponent(value)}&lifespan=${encodeURIComponent(lifespan)}&method=${method}`,
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
  }, [value, lifespan, method]);
  return value ? result : {};
}
