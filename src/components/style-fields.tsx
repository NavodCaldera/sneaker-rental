"use client";

import { useState } from "react";
import { Field, Select, cx } from "@/components/ui";
import type { Audience } from "@/generated/prisma/enums";
import { EXPERIENCES, LISTING_AUDIENCES } from "@/lib/shoe-style";

/**
 * "Who it's for" select and "Experiences" checkboxes for a listing. A pair can be made for
 * several experiences (product owner, 2026-10-12). The list follows the audience, so a Boys
 * pair offers "School Day" and a Women's pair "Brunch & Errands"; changing the audience drops
 * picks it doesn't offer.
 */
export function StyleFields({
  errors = {},
  defaultAudience,
  defaultExperiences = [],
  onAudienceChange,
}: {
  errors?: Record<string, string[] | undefined>;
  defaultAudience?: Audience;
  defaultExperiences?: string[];
  /** Tells the form who it's for (the size fields use that audience's chart) */
  onAudienceChange?: (audience: Audience) => void;
}) {
  const [audience, setAudience] = useState<Audience | "">(defaultAudience ?? "");
  const [picked, setPicked] = useState<string[]>(defaultExperiences);
  const options = audience ? EXPERIENCES[audience] : [];
  const message = errors.experiences?.[0];

  return (
    <>
      <Field label="To whom" name="audience" error={errors.audience}>
        <Select
          name="audience"
          value={audience}
          onChange={(e) => {
            const next = e.target.value as Audience;
            setAudience(next);
            setPicked((p) => p.filter((x) => EXPERIENCES[next].includes(x)));
            onAudienceChange?.(next);
          }}
        >
          <option value="" disabled>
            Choose…
          </option>
          {LISTING_AUDIENCES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">Experiences</legend>
        {audience ? (
          <div className="flex flex-wrap gap-2">
            {options.map((x) => {
              const on = picked.includes(x);
              return (
                <label
                  key={x}
                  className={cx(
                    "cursor-pointer rounded-full border px-3 py-1.5 text-sm focus-within:ring-2 focus-within:ring-ink",
                    on ? "border-ink bg-muted font-medium" : "border-line",
                  )}
                >
                  <input
                    type="checkbox"
                    name="experiences"
                    value={x}
                    checked={on}
                    onChange={() =>
                      // Keep the audience's order, so listings show them the same way.
                      setPicked((p) => options.filter((o) => (o === x ? !on : p.includes(o))))
                    }
                    className="sr-only"
                  />
                  {x}
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-subtle">Choose who it&apos;s for first.</p>
        )}
        {message ? (
          <p className="text-xs font-medium text-ink" role="alert">
            {message}
          </p>
        ) : (
          <p className="text-xs text-subtle">
            Pick every moment it&apos;s made for. Borrowers shop by them.
          </p>
        )}
      </fieldset>
    </>
  );
}
