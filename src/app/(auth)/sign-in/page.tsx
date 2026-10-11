import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card } from "@/components/ui";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { reset } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-sm py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Sign in</h1>
      {reset === "done" && (
        <div className="mb-4">
          <Alert tone="good">Your password has been changed. Sign in with your new password.</Alert>
        </div>
      )}
      <Card>
        <SignInForm />
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
