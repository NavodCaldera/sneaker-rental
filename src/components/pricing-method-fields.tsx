"use client";

import { useId } from "react";
import { cx } from "@/components/ui";
import type { PricingMethod } from "@/generated/prisma/enums";
import { PRICING_METHOD_HELP, PRICING_METHOD_OPTIONS } from "@/lib/pricing-method";

/**
 * The merchant's choice of price curve for a listing: S-curve or exponential decay
 * (pricing-spec.md §2). Sends `pricingMethod` with the form. A "?" after the heading explains,
 * on hover, tap or keyboard focus, how to choose: match the curve to how the pair's quality
 * degrades.
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
  const tipId = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      {/* The tooltip is placed from the legend's left edge, so it fits on a phone. */}
      <legend className="relative mb-1.5 flex items-center gap-1.5 text-sm font-medium">
        Pricing method
        <span className="group inline-flex">
          <button
            type="button"
            aria-label="How to choose a pricing method"
            aria-describedby={tipId}
            // Escape hides it again (the tooltip shows while the button has focus).
            onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
            className="inline-flex size-5 cursor-help items-center justify-center rounded-full border border-line text-xs font-semibold hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            ?
          </button>
          <span
            id={tipId}
            role="tooltip"
            className="invisible absolute top-full left-0 z-30 mt-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-1.5 rounded-lg border border-line bg-paper p-3 text-xs font-normal text-ink opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
          >
            <span className="font-medium">{PRICING_METHOD_HELP.title}</span>
            <span>{PRICING_METHOD_HELP.intro}</span>
            {PRICING_METHOD_OPTIONS.map((m) => (
              <span key={m.value}>{PRICING_METHOD_HELP.reasons[m.value]}</span>
            ))}
          </span>
        </span>
      </legend>
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
