"use client";

import { useActionState } from "react";
import { type AddressState, updateAddressAction } from "@/app/account/actions";
import { ADDRESS_LABEL, ADDRESS_REASON } from "@/lib/address";
import { Alert, Button, Field, Textarea } from "./ui";

/** The account's one address, with why we ask for it. */
export function AddressForm({
  role,
  current,
}: {
  role: "BORROWER" | "MERCHANT";
  current: string | null;
}) {
  const [state, action, pending] = useActionState<AddressState, FormData>(updateAddressAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="good">{state.ok}</Alert>}
      {!current && !state.ok && (
        <Alert>Add your address: we can&apos;t book any trips without it.</Alert>
      )}
      <Field label={ADDRESS_LABEL[role]} name="address" hint={ADDRESS_REASON[role]}>
        <Textarea
          name="address"
          autoComplete="street-address"
          rows={2}
          required
          minLength={10}
          maxLength={300}
          defaultValue={current ?? ""}
        />
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save address"}
      </Button>
    </form>
  );
}
