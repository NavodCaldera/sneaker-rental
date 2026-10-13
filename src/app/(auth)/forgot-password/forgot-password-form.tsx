"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { type ForgotState, forgotPasswordAction } from "@/server/auth/actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(forgotPasswordAction, {});
  if (state.sentTo) {
    return (
      <div className="flex flex-col gap-4 text-sm">
        <Alert tone="good">
          If <span className="font-semibold">{state.sentTo}</span> has an account, we&apos;ve
          emailed it a link to reset the password. The link works for an hour.
        </Alert>
        <p className="text-subtle">No email? Check your spam folder, or try again in a minute.</p>
        {state.devLink && (
          <div className="rounded-lg border border-dashed border-line p-3">
            <p className="mb-1 text-xs text-subtle">
              Development only: emails aren&apos;t really sent yet, so here is the link.
            </p>
            <Link href={state.devLink} className="break-all underline">
              Reset your password
            </Link>
          </div>
        )}
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Email" name="email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" disabled={pending} className="max-sm:min-h-11">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
