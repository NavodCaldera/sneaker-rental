import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { Alert, Card } from "@/components/ui";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { reset, next } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-sm py-4 max-sm:-mt-4 max-sm:pt-0 sm:py-8">
      <BackButton href="/" to="home" useHistory className="mb-4 sm:hidden" />
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Sign in</h1>
      {reset === "done" && (
        <div className="mb-4">
          <Alert tone="good">Your password has been changed. Sign in with your new password.</Alert>
        </div>
      )}
      <Card className="max-sm:border-0 max-sm:bg-transparent max-sm:p-0">
        <SignInForm next={typeof next === "string" ? next : undefined} />
      </Card>
      <p className="mt-4 text-sm text-subtle">
        New here?{" "}
        <Link href="/sign-up" className="underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
