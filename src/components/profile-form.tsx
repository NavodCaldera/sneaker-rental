"use client";

import { useActionState } from "react";
import { type ProfileState, updateProfileAction } from "@/app/account/actions";
import type { ProfileUser } from "@/lib/borrower-profile";
import { ProfileFields } from "./profile-fields";
import { Alert, Button } from "./ui";

/** A customer's profile on their account page; sign-up asks the same questions. */
export function ProfileForm({ current, today }: { current: ProfileUser; today: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfileAction, {});
  const missing = !current.dateOfBirth || !current.gender || !current.shoeSize;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.ok && <Alert tone="good">{state.ok}</Alert>}
      {missing && !state.ok && (
        <Alert>Tell us about you, and we&apos;ll show you shoes in your size, made for you.</Alert>
      )}
      <ProfileFields current={current} today={today} errors={state.fieldErrors} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
