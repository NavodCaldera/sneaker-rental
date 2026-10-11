"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { type DisputeState, decideAction } from "./actions";

const OPTIONS = [
  {
    value: "CHARGE_DEPOSIT",
    label: "Charge the borrower's tokens",
    hint: "Damage. Up to the pair's value, from their locked tokens. Paid to the merchant.",
  },
  {
    value: "REFUND_BORROWER",
    label: "Refund the borrower",
    hint: "Overcharge. Given back as tokens; comes off the merchant's share first.",
  },
  {
    value: "NO_ACTION",
    label: "No action",
    hint: "Reject the dispute and unlock the pair's tokens.",
  },
] as const;

export function DecideForm({ disputeId }: { disputeId: string }) {
  const [state, action, pending] = useActionState<DisputeState, FormData>(
    decideAction.bind(null, disputeId),
    {},
  );
  const [resolution, setResolution] = useState<string>("NO_ACTION");
  return (
    <form action={action} className="flex flex-col gap-3 border-t border-line pt-4">
      {state.error && <Alert>{state.error}</Alert>}
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="mb-1.5 text-sm font-medium">Decision</legend>
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer gap-2 rounded-lg border border-line p-3 text-sm has-[:checked]:border-ink has-[:checked]:bg-muted"
          >
            <input
              type="radio"
              name="resolution"
              value={o.value}
              checked={resolution === o.value}
              onChange={() => setResolution(o.value)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">{o.label}</span>
              <span className="block text-xs text-subtle">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {resolution !== "NO_ACTION" && (
        <Field label="Amount (LKR)" name="amount" error={state.fieldErrors?.amount}>
          <Input name="amount" inputMode="decimal" required className="w-40" />
        </Field>
      )}
      <Field label="Reason for the decision" name="decision" error={state.fieldErrors?.decision}>
        <Textarea name="decision" required rows={2} />
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        Decide
      </Button>
    </form>
  );
}
