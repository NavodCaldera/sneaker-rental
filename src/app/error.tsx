"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-subtle">
        Please try again. If it keeps happening, contact support
        {error.digest ? ` and mention reference ${error.digest}` : ""}.
      </p>
      <Button onClick={reset} className="self-center">
        Try again
      </Button>
    </main>
  );
}
