"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import {
  type ActionState,
  answerOfferAction,
  earlyReturnAction,
  endRentalAction,
  extendRentalAction,
} from "./actions";

export function EarlyReturnForm({
  itemId,
  name,
  min,
  max,
  noticeDays,
}: {
  itemId: string;
  name: string;
  /** Earliest and latest last day you can pick, YYYY-MM-DD */
  min: string;
  max: string;
  noticeDays: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    earlyReturnAction.bind(null, itemId),
    {},
  );
  const id = `early-${itemId}`;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="good">{state.ok}</Alert>}
      <Field
        label={`Return ${name} early: last day`}
        name={id}
        error={state.fieldErrors?.lastDay}
        hint={`At least ${noticeDays} days' notice. Unused days are refunded now.`}
      >
        <Input id={id} name="lastDay" type="date" min={min} max={max} defaultValue={min} required />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Booking…" : "Book early return"}
      </Button>
    </form>
  );
}

export function EndRentalForm({ itemId, name }: { itemId: string; name: string }) {
  const [state, action, pending] = useActionState<ActionState>(
    endRentalAction.bind(null, itemId),
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error && <Alert>{state.error}</Alert>}
      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        aria-label={`End rental of ${name}`}
      >
        End rental
      </Button>
    </form>
  );
}

export function ExtendForm({ itemId, name }: { itemId: string; name: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    extendRentalAction.bind(null, itemId),
    {},
  );
  const id = `extend-${itemId}`;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="good">{state.ok}</Alert>}
      <Field label={`Extend ${name} by (days)`} name={id} error={state.fieldErrors?.days}>
        <Input
          id={id}
          name="days"
          type="number"
          min={1}
          max={365}
          defaultValue={7}
          className="w-24"
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Extending…" : "Pay and extend"}
      </Button>
    </form>
  );
}

export function OfferButtons({ itemId }: { itemId: string }) {
  const [accepted, accept, accepting] = useActionState<ActionState>(
    answerOfferAction.bind(null, itemId, "accept"),
    {},
  );
  const [rejected, reject, rejecting] = useActionState<ActionState>(
    answerOfferAction.bind(null, itemId, "reject"),
    {},
  );
  const error = accepted.error ?? rejected.error;
  return (
    <div className="flex flex-col gap-2">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <form action={accept}>
          <Button type="submit" disabled={accepting || rejecting}>
            Accept new price
          </Button>
        </form>
        <form action={reject}>
          <Button type="submit" variant="secondary" disabled={accepting || rejecting}>
            Reject and get a refund
          </Button>
        </form>
      </div>
    </div>
  );
}
