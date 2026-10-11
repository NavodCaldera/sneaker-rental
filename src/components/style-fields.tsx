"use client";

import { useState } from "react";
import { Field, Select } from "@/components/ui";
import type { Audience } from "@/generated/prisma/enums";
import { EXPERIENCES, LISTING_AUDIENCES } from "@/lib/shoe-style";

/**
 * "Who it's for" and "Experience" selects for a listing. The experience list follows the
 * audience, so a Boys pair offers "School Day" and a Women's pair "Brunch & Errands".
 */
export function StyleFields({
  errors = {},
  defaultAudience,
  defaultExperience,
}: {
  errors?: Record<string, string[] | undefined>;
  defaultAudience?: Audience;
  defaultExperience?: string;
}) {
  const [audience, setAudience] = useState<Audience | "">(defaultAudience ?? "");
  const [experience, setExperience] = useState(defaultExperience ?? "");
  const options = audience ? EXPERIENCES[audience] : [];

  return (
    <>
      <Field label="Who it's for" name="audience" error={errors.audience}>
        <Select
          name="audience"
          value={audience}
          onChange={(e) => {
            const next = e.target.value as Audience;
            setAudience(next);
            if (!EXPERIENCES[next].includes(experience)) setExperience("");
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
      <Field
        label="Experience"
        name="experience"
        error={errors.experience}
        hint="The moment it's made for. Borrowers shop by it."
      >
        <Select
          name="experience"
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
          disabled={!audience}
        >
          <option value="" disabled>
            {audience ? "Choose…" : "Choose who it's for first"}
          </option>
          {options.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </Select>
      </Field>
    </>
  );
}
