"use client";

import { useActionState } from "react";
import { StyleFields } from "@/components/style-fields";
import { Alert, Button, Card } from "@/components/ui";
import type { Audience } from "@/generated/prisma/enums";
import { type ActionState, updateShoeStyleAction } from "../../actions";

/** Change who a pair is for and its experience; borrowers shop by both. */
export function StyleForm({
  shoeId,
  audience,
  experience,
}: {
  shoeId: string;
  audience: Audience;
  experience: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateShoeStyleAction.bind(null, shoeId),
    {},
  );
  return (
    <Card>
      <h2 className="mb-3 font-medium">Who it&apos;s for</h2>
      <form action={action} className="grid items-start gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <StyleFields
          errors={state.fieldErrors}
          defaultAudience={audience}
          defaultExperience={experience}
        />
        <Button type="submit" variant="secondary" disabled={pending} className="sm:mt-6">
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="good">{state.ok}</Alert>}
    </Card>
  );
}
