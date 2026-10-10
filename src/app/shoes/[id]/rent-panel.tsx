import Link from "next/link";
import type { Role, ShoeStatus } from "@/generated/prisma/client";
import { Card } from "@/components/ui";

/** Rent / reserve controls. Booking is wired up in Step 4. */
export function RentPanel({
  status,
  handoffTaken,
  signedInAs,
}: {
  shoeId: string;
  status: ShoeStatus;
  handoffTaken: boolean;
  signedInAs: Role | null;
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
  if (status === "WITH_BORROWER" && handoffTaken) {
    return <Card className="text-sm">Someone has already reserved this pair next.</Card>;
  }
  return null;
}
