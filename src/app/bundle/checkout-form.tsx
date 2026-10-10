"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Textarea } from "@/components/ui";
import { type ActionState, checkoutAction } from "@/app/rentals/actions";

export function CheckoutForm({ plannedDays }: { plannedDays: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(checkoutAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="plannedDays" value={plannedDays} />
      <Field
        label="Delivery address"
        name="deliveryAddress"
        error={state.fieldErrors?.deliveryAddress}
      >
        <Textarea name="deliveryAddress" required rows={2} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Booking…" : "Check out"}
      </Button>
    </form>
  );
}
