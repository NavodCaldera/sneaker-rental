"use client";

import { useActionState } from "react";
import { Alert, Button, Card } from "@/components/ui";
import { type ActionState, deleteDraftAction, publishShoeAction } from "../../actions";

export function DraftActions({ shoeId }: { shoeId: string }) {
  const [state, publish, pending] = useActionState<ActionState>(
    publishShoeAction.bind(null, shoeId),
    {},
  );
  return (
    <Card className="flex flex-col gap-3">
      <p className="text-sm">
        This listing is a <strong>draft</strong>. Check the price curve below, then publish it to
        make all its pairs available to borrowers.
      </p>
      {state.error && <Alert>{state.error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <form action={publish}>
          <Button type="submit" disabled={pending}>
            {pending ? "Publishing…" : "Publish"}
          </Button>
        </form>
        <form action={deleteDraftAction.bind(null, shoeId)}>
          <Button type="submit" variant="secondary">
            Delete draft
          </Button>
        </form>
      </div>
    </Card>
  );
}
