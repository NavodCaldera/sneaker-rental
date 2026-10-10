"use client";

import { useActionState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { type CourierState, dropoffAction, pickupAction } from "../actions";

export function CourierForm({
  token,
  step,
  handoff,
}: {
  token: string;
  step: "pickup" | "dropoff";
  handoff: boolean;
}) {
  const action = step === "pickup" ? pickupAction : dropoffAction;
  const [state, formAction, pending] = useActionState<CourierState, FormData>(
    action.bind(null, token),
    {},
  );
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      <Field
        label={
          step === "pickup" ? "Photo of the sealed bag" : "Photo of the sealed bag at the door"
        }
        name="photo"
      >
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          required
          className="text-sm file:mr-3 file:min-h-10 file:rounded-md file:border file:border-line file:bg-paper file:px-3"
        />
      </Field>
      {step === "pickup" && (
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="sealedBag" required className="size-5" /> The pair is in a
            sealed bag
          </label>
          {handoff && (
            <label className="flex items-center gap-2">
              <input type="checkbox" name="cleaningKit" required className="size-5" /> The cleaning
              kit is in the bag
            </label>
          )}
        </div>
      )}
      <Button type="submit" disabled={pending} className="min-h-12 text-base">
        {pending ? "Saving…" : step === "pickup" ? "Picked up" : "Delivered"}
      </Button>
    </form>
  );
}
