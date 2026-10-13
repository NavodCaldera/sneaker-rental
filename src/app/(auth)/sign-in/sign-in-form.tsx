"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PasswordInput } from "@/components/password-input";
import { Alert, Button, Field, Input } from "@/components/ui";
import { signInAction, type FormState } from "@/server/auth/actions";

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email" name="email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" name="password">
        <PasswordInput name="password" autoComplete="current-password" required />
      </Field>
      <Link href="/forgot-password" className="-mt-2 self-end text-sm underline">
        Forgot password?
      </Link>
      <Button type="submit" disabled={pending} className="max-sm:min-h-11">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
