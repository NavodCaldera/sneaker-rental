"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PasswordInput } from "@/components/password-input";
import { Alert, Button, Field } from "@/components/ui";
import { type FormState, resetPasswordAction } from "@/server/auth/actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && (
        <Alert>
          {state.error}{" "}
          <Link href="/forgot-password" className="underline">
            Send a new link
          </Link>
        </Alert>
      )}
      <input type="hidden" name="token" value={token} />
      <Field
        label="New password"
        name="password"
        error={state.fieldErrors?.password}
        hint="At least 8 characters. You'll be signed out everywhere else."
      >
        <PasswordInput name="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
