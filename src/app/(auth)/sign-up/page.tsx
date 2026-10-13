import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { colomboToday } from "@/server/auth/service";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const { role } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-md py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Create an account</h1>
      <Card>
        <SignUpForm
          defaultRole={role === "MERCHANT" ? "MERCHANT" : "BORROWER"}
          today={colomboToday()}
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
