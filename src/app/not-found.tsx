import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm text-subtle">
        This page doesn&apos;t exist, or the pair is no longer listed.
      </p>
      <LinkButton href="/browse" className="self-center">
        Browse shoes
      </LinkButton>
    </main>
  );
}
