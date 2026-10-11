"use client";

import { useActionState } from "react";
import { type AddressState, updateAddressAction } from "@/app/account/actions";
import { ADDRESS_LABEL, ADDRESS_REASON } from "@/lib/address";
import { Alert, Button, Field, Input, Textarea } from "./ui";

/** The account's one address, with why we ask for it. */
export function AddressForm({
  role,
  current,
  currentCity,
}: {
  role: "BORROWER" | "MERCHANT";
  current: string | null;
  currentCity: string | null;
}) {
  const [state, action, pending] = useActionState<AddressState, FormData>(updateAddressAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="good">{state.ok}</Alert>}
      {(!current || !currentCity) && !state.ok && (
        <Alert>Add your address and city: we can&apos;t book any trips without them.</Alert>
      )}
      <Field label={ADDRESS_LABEL[role]} name="address" hint={ADDRESS_REASON[role]}>
        <Textarea
          name="address"
          autoComplete="street-address"
          rows={2}
          required
          minLength={5}
          maxLength={300}
          defaultValue={current ?? ""}
          placeholder="No. 12, Flower Road"
        />
      </Field>
      <Field label="City" name="city">
        <Input
          name="city"
          autoComplete="address-level2"
          required
          minLength={2}
          maxLength={60}
          defaultValue={currentCity ?? ""}
          placeholder="Colombo 07"
        />
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save address"}
      </Button>
    </form>
  );
}
