import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { resetLinkWorks } from "@/server/auth/password-reset";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

/** Opened from the "forgot password" email: `?token=` is the one-time link. */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  const works = await resetLinkWorks(value);
  return (
    <main className="mx-auto w-full max-w-sm py-4 sm:py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Choose a new password</h1>
      {works ? (
        <Card className="max-sm:border-0 max-sm:bg-transparent max-sm:p-0">
          <ResetPasswordForm token={value} />
        </Card>
      ) : (
        <Card className="text-sm">
          <p className="mb-3">This link has expired or was already used.</p>
          <Link href="/forgot-password" className="underline">
            Send a new link
          </Link>
        </Card>
      )}
    </main>
  );
}
