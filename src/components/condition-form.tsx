"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Textarea, cx } from "./ui";

type State = { error?: string; fieldErrors?: Record<string, string[] | undefined> };

const GRADES = [
  { value: "A", label: "A · As new" },
  { value: "B", label: "B · Light wear" },
  { value: "C", label: "C · Visible wear" },
  { value: "D", label: "D · Retire" },
];

/** Condition at a handover: grade A–D, photos, notes and a damage flag (§6). */
export function ConditionForm({
  action,
  submitLabel = "Record condition",
}: {
  action: (state: State, formData: FormData) => Promise<State>;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Grade</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GRADES.map((g) => (
            <label
              key={g.value}
              className={cx(
                "flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-ink has-[:checked]:bg-muted",
              )}
            >
              <input type="radio" name="grade" value={g.value} required />
              {g.label}
            </label>
          ))}
        </div>
        {state.fieldErrors?.grade && (
          <p className="mt-1 text-xs text-danger">{state.fieldErrors.grade[0]}</p>
        )}
      </fieldset>
      <Field label="Photos" name="photos" hint="At least one. JPEG, PNG or WebP, up to 5 MB each.">
        <input
          id="photos"
          name="photos"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          required
          className="text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-paper file:px-3 file:py-1.5"
        />
      </Field>
      <Field label="Notes (optional)" name="notes">
        <Textarea name="notes" maxLength={1000} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="damageFlag" className="mt-0.5" />
        <span>
          <strong>Flag damage beyond normal wear.</strong> An admin will review the photos and trip
          log.
        </span>
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
