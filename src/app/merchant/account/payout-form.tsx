"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { type ActionState, updatePayoutAction } from "../actions";

export function PayoutForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updatePayoutAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="good">{state.ok}</Alert>}
      <Field
        label="Payout account"
        name="payoutAccount"
        hint="Bank and account number for weekly payouts"
      >
        <Input name="payoutAccount" defaultValue={current} required />
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        Save
      </Button>
    </form>
  );
}
