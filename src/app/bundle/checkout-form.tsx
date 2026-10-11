"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Button } from "@/components/ui";
import { type ActionState, checkoutAction } from "@/app/rentals/actions";

export function CheckoutForm({
  plannedDays,
  address,
}: {
  plannedDays: number;
  /** The account's one address: pairs are delivered to and collected from it */
  address: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(checkoutAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="plannedDays" value={plannedDays} />
      <div className="text-sm">
        <div className="font-medium">Delivered to and collected from</div>
        {address ? (
          <p className="whitespace-pre-line text-subtle">{address}</p>
        ) : (
          <Alert>Add your address before booking.</Alert>
        )}
        <Link href="/account" className="text-xs underline">
          {address ? "Change address" : "Add address"}
        </Link>
      </div>
      <Button type="submit" disabled={pending || !address}>
        {pending ? "Booking…" : "Check out"}
      </Button>
    </form>
  );
}
