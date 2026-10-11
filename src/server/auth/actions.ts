"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { mailer } from "../notify/mailer";
import { newPasswordSchema, requestPasswordReset, resetPassword } from "./password-reset";
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

export type ForgotState = {
  error?: string;
  /** The address the link was sent to, if it has an account */
  sentTo?: string;
  /** Development with the mock mailer only: the emailed link, since no email really goes out */
  devLink?: string;
};

export async function forgotPasswordAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const email = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email())
    .safeParse(formData.get("email") ?? "");
  if (!email.success) return { error: "Enter a valid email" };
  const sent = await requestPasswordReset(email.data);
  const showLink = process.env.NODE_ENV !== "production" && mailer().name === "mock";
  return { sentTo: email.data, devLink: showLink ? sent?.link : undefined };
}

/** `fieldErrors` for a password we can't accept; `error` when the link no longer works. */
export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = newPasswordSchema.safeParse(formData.get("password") ?? "");
  if (!password.success) {
    return { fieldErrors: { password: password.error.issues.map((i) => i.message) } };
  }
  try {
    await resetPassword(String(formData.get("token") ?? ""), password.data);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect("/sign-in?reset=done");
}
