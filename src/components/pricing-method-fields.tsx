"use client";

import { cx } from "@/components/ui";
import type { PricingMethod } from "@/generated/prisma/enums";
import { PRICING_METHOD_OPTIONS } from "@/lib/pricing-method";

/**
 * The merchant's choice of price curve for a listing: S-curve or exponential decay
 * (pricing-spec.md §2). Sends `pricingMethod` with the form.
 */
export function PricingMethodFields({
  value,
  onChange,
  floorPercent,
  error,
}: {
  value: PricingMethod;
  onChange: (method: PricingMethod) => void;
  /** End-of-life price as a percentage of the new price, from settings (e.g. "30") */
  floorPercent: string;
  error?: string[];
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Pricing method</legend>
      <div className="grid gap-2">
        {PRICING_METHOD_OPTIONS.map((m) => (
          <label
            key={m.value}
            className={cx(
              "cursor-pointer rounded-lg border px-3 py-2 text-sm",
              value === m.value ? "border-ink bg-muted" : "border-line",
            )}
          >
            <input
              type="radio"
              name="pricingMethod"
              value={m.value}
              checked={value === m.value}
              onChange={() => onChange(m.value)}
              className="sr-only"
            />
            <span className={cx("block", value === m.value && "font-medium")}>{m.label}</span>
            <span className="block text-xs text-subtle">{m.description}</span>
          </label>
        ))}
      </div>
      {error?.[0] ? (
        <p className="text-xs font-medium text-ink" role="alert">
          {error[0]}
        </p>
      ) : (
        <p className="text-xs text-subtle">
          Both end at {floorPercent}% of the new price and earn the same over the pair&apos;s life.
          You can change it until you publish.
        </p>
      )}
    </fieldset>
  );
}
