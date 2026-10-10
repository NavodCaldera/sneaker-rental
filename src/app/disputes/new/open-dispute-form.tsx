"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Textarea } from "@/components/ui";
import { type OpenDisputeState, openDisputeAction } from "./actions";

export function OpenDisputeForm({ itemId, back }: { itemId: string; back: string }) {
  const [state, action, pending] = useActionState<OpenDisputeState, FormData>(
    openDisputeAction.bind(null, itemId, back),
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="What went wrong?" name="reason">
        <Textarea name="reason" required minLength={10} rows={4} />
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        Open dispute
      </Button>
    </form>
  );
}
