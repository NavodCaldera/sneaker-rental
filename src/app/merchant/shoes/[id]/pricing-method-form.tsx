"use client";

import { useActionState, useState } from "react";
import { PricingMethodFields } from "@/components/pricing-method-fields";
import { Alert, Button, Card } from "@/components/ui";
import type { PricingMethod } from "@/generated/prisma/enums";
import { type ActionState, updatePricingMethodAction } from "../../actions";

/** A draft's price curve: S-curve or exponential decay. Fixed once the pair is published. */
export function PricingMethodForm({
  shoeId,
  method,
  floorPercent,
}: {
  shoeId: string;
  method: PricingMethod;
  floorPercent: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updatePricingMethodAction.bind(null, shoeId),
    {},
  );
  const [choice, setChoice] = useState<PricingMethod>(method);
  return (
    <Card>
      <form action={action} className="flex flex-col gap-4">
        <PricingMethodFields
          value={choice}
          onChange={setChoice}
          floorPercent={floorPercent}
          error={state.fieldErrors?.pricingMethod}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={pending || choice === method}
          className="self-start"
        >
          {pending ? "Saving…" : "Save pricing method"}
        </Button>
      </form>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="good">{state.ok}</Alert>}
    </Card>
  );
}
