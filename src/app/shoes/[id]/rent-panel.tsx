import Link from "next/link";
import type { Role, ShoeStatus } from "@/generated/prisma/client";
import { Button, Card } from "@/components/ui";
import { addToBundleAction } from "@/app/rentals/actions";

/** Rent now (available) or reserve next (held by another borrower, for a direct handoff). */
export function RentPanel({
  shoeId,
  status,
  handoffTaken,
  releaseOpen,
  signedInAs,
  inBundle,
}: {
  shoeId: string;
  status: ShoeStatus;
  handoffTaken: boolean;
  /** A held pair can be reserved once its holder's release window opens */
  releaseOpen: boolean;
  signedInAs: Role | null;
  inBundle: boolean;
}) {
  if (!signedInAs) {
    return (
      <Card className="text-sm">
        <Link href="/sign-in" className="underline">
          Sign in
        </Link>{" "}
        to rent this pair.
      </Card>
    );
  }
  if (signedInAs !== "BORROWER") return null;
  if (inBundle) {
    return (
      <Card className="text-sm">
        In your bundle.{" "}
        <Link href="/bundle" className="underline">
          View bundle
        </Link>
      </Card>
    );
  }
  if (status === "AVAILABLE") {
    return (
      <form action={addToBundleAction.bind(null, shoeId)}>
        <Button type="submit" className="w-full">
          Add to bundle
        </Button>
      </form>
    );
  }
  if (status === "WITH_BORROWER" && !handoffTaken && releaseOpen) {
    return (
      <Card className="flex flex-col gap-3 text-sm">
        <p>
          Someone is wearing this pair now. Reserve it and it comes straight to you when
          they&apos;re done, in a sealed bag with a cleaning kit.
        </p>
        <form action={addToBundleAction.bind(null, shoeId)}>
          <Button type="submit" variant="secondary" className="w-full">
            Reserve next
          </Button>
        </form>
      </Card>
    );
  }
  return <Card className="text-sm">This pair isn&apos;t available to book right now.</Card>;
}
