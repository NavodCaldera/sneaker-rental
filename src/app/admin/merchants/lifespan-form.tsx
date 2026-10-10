"use client";

import { useActionState } from "react";
import { Button, Input } from "@/components/ui";
import { type LifespanState, saveLifespanExtensionAction } from "./actions";

/** Admin grants a merchant a longer lifespan limit on request. Empty = standard limit. */
export function LifespanForm({
  merchantId,
  months,
  standardMonths,
}: {
  merchantId: string;
  months: number | null;
  standardMonths: number;
}) {
  const [state, action, pending] = useActionState<LifespanState, FormData>(
    saveLifespanExtensionAction.bind(null, merchantId),
    {},
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor={`months-${merchantId}`} className="text-subtle">
        Max lifespan (months)
      </label>
      <Input
        id={`months-${merchantId}`}
        name="months"
        type="number"
        min={standardMonths + 1}
        max={120}
        defaultValue={months ?? ""}
        placeholder={`${standardMonths} (standard)`}
        className="w-36"
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        Save
      </Button>
      {state.error && <span className="text-danger">{state.error}</span>}
      {state.ok && <span className="text-good">{state.ok}</span>}
    </form>
  );
}
