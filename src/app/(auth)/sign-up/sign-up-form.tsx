"use client";

import { PasswordInput } from "@/components/password-input";
import { ProfileFields } from "@/components/profile-fields";
import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Textarea, cx } from "@/components/ui";
import { ADDRESS_LABEL, ADDRESS_REASON } from "@/lib/address";
import { signUpAction, type FormState } from "@/server/auth/actions";

export function SignUpForm({
  defaultRole,
  today,
  birthdayFreePairs,
}: {
  defaultRole: "MERCHANT" | "BORROWER";
  birthdayFreePairs: number;
  /** Today in Colombo, "YYYY-MM-DD" */
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(signUpAction, {});
  const [role, setRole] = useState(defaultRole);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">Account type</legend>
        {(
          [
            ["BORROWER", "Customer"],
            ["MERCHANT", "Merchant"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={cx(
              "cursor-pointer rounded-lg border px-3 py-2 text-sm",
              role === value ? "border-ink bg-muted font-medium" : "border-line",
            )}
          >
            <input
              type="radio"
              name="role"
              value={value}
              checked={role === value}
              onChange={() => setRole(value)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </fieldset>
      <Field label="Full name" name="name" error={errors.name}>
        <Input name="name" autoComplete="name" required />
      </Field>
      {role === "MERCHANT" && (
        <Field label="Business name" name="businessName" error={errors.businessName}>
          <Input name="businessName" autoComplete="organization" required />
        </Field>
      )}
      <Field label="Email" name="email" error={errors.email}>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      {role === "BORROWER" && (
        <ProfileFields today={today} birthdayFreePairs={birthdayFreePairs} errors={errors} />
      )}
      <Field label="Phone" name="phone" error={errors.phone}>
        <Input name="phone" type="tel" autoComplete="tel" placeholder="+94 77 123 4567" />
      </Field>
      <Field
        label={ADDRESS_LABEL[role]}
        name="address"
        error={errors.address}
        hint={ADDRESS_REASON[role]}
      >
        <Textarea
          name="address"
          autoComplete="street-address"
          rows={2}
          required
          minLength={5}
          maxLength={300}
          placeholder="No. 12, Flower Road"
        />
      </Field>
      <Field label="City" name="city" error={errors.city}>
        <Input
          name="city"
          autoComplete="address-level2"
          required
          minLength={2}
          maxLength={60}
          placeholder="Colombo 07"
        />
      </Field>
      <Field label="Password" name="password" error={errors.password} hint="At least 8 characters">
        <PasswordInput name="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
