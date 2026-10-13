import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { colomboToday } from "@/server/auth/service";
import { getActiveSettings } from "@/server/settings";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const { role } = await searchParams;
  const settings = await getActiveSettings();
  return (
    <main className="mx-auto w-full max-w-md py-4 sm:py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Create an account</h1>
      <Card className="max-sm:border-0 max-sm:bg-transparent max-sm:p-0">
        <SignUpForm
          defaultRole={role === "MERCHANT" ? "MERCHANT" : "BORROWER"}
          today={colomboToday()}
          birthdayFreePairs={settings.birthdayFreePairs}
        />
      </Card>
      <p className="mt-4 text-sm text-subtle">
        Already have an account?{" "}
        <Link href="/sign-in" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
