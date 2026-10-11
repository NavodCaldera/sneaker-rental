import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto w-full max-w-sm py-8">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Forgot your password?</h1>
      <p className="mb-6 text-sm text-subtle">
        Enter the email you signed up with and we&apos;ll send you a link to choose a new one.
      </p>
      <Card>
        <ForgotPasswordForm />
      </Card>
      <p className="mt-4 text-sm text-subtle">
        Remembered it?{" "}
        <Link href="/sign-in" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
