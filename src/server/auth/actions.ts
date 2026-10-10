"use server";

import { redirect } from "next/navigation";
import { AuthError, authenticate, homeFor, registerUser, signUpSchema } from "./service";
import { signInAs, signOut } from "./session";

export type FormState = { error?: string; fieldErrors?: Record<string, string[] | undefined> };

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  let role;
  try {
    const user = await registerUser(parsed.data);
    await signInAs(user.id);
    role = user.role;
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect(homeFor(role));
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  let role;
  try {
    const user = await authenticate(email, password);
    await signInAs(user.id);
    role = user.role;
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect(homeFor(role));
}

export async function signOutAction() {
  await signOut();
  redirect("/");
}
