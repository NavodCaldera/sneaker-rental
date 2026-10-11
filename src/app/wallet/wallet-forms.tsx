"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { type WalletState, topUpAction, withdrawAction } from "./actions";

export function TopUpForm({
  amount,
  next,
  formKey,
  testMode,
}: {
  amount?: string;
  next?: string;
  /** One per page view, so a double submit charges the card once */
  formKey: string;
  testMode: boolean;
}) {
  const [state, action, pending] = useActionState<WalletState, FormData>(topUpAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="good">{state.ok}</Alert>}
      <input type="hidden" name="key" value={formKey} />
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Tokens to buy (1 token = LKR 1)" name="topup-amount">
        <Input
          id="topup-amount"
          name="amount"
          inputMode="decimal"
          defaultValue={amount}
          placeholder="12600"
          required
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Paying…" : "Pay by card"}
      </Button>
      {testMode && <p className="text-xs text-subtle">Test mode: no real card is charged.</p>}
    </form>
  );
}

export function WithdrawForm({ available }: { available: string }) {
  const [state, action, pending] = useActionState<WalletState, FormData>(withdrawAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="good">{state.ok}</Alert>}
      <Field label="Tokens to withdraw" name="withdraw-amount" hint={`Up to ${available}`}>
        <Input id="withdraw-amount" name="amount" inputMode="decimal" required />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        Refund to my card
      </Button>
    </form>
  );
}
