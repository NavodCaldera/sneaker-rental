"use client";

import { useActionState } from "react";
import type { DeliveryStatus } from "@/generated/prisma/client";
import { Alert, Button, Input } from "@/components/ui";
import {
  type DeliveryActionState,
  bookAction,
  quoteAction,
  renewLinkAction,
  statusAction,
} from "./actions";

export function DeliveryControls({
  deliveryId,
  status,
  quote,
}: {
  deliveryId: string;
  status: DeliveryStatus;
  quote: string;
}) {
  const [quoteState, quoteForm, quoting] = useActionState<DeliveryActionState, FormData>(
    quoteAction.bind(null, deliveryId),
    {},
  );
  const [bookState, book, booking] = useActionState<DeliveryActionState>(
    bookAction.bind(null, deliveryId),
    {},
  );
  const [linkState, renew] = useActionState<DeliveryActionState>(
    renewLinkAction.bind(null, deliveryId),
    {},
  );
  const [pickState, pickedUp, picking] = useActionState<DeliveryActionState>(
    statusAction.bind(null, deliveryId, "PICKED_UP"),
    {},
  );
  const [dropState, delivered, dropping] = useActionState<DeliveryActionState>(
    statusAction.bind(null, deliveryId, "DELIVERED"),
    {},
  );
  const error =
    quoteState.error ?? bookState.error ?? linkState.error ?? pickState.error ?? dropState.error;
  const link = linkState.courierLink ?? bookState.courierLink;

  return (
    <div className="flex flex-col gap-2">
      {error && <Alert>{error}</Alert>}
      {link && (
        <Alert tone="good">
          Courier link (send it to the driver; it&apos;s shown once):{" "}
          <a href={link} className="break-all font-mono underline">
            {link}
          </a>
        </Alert>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {(status === "REQUESTED" || status === "QUOTED") && (
          <form action={quoteForm} className="flex items-end gap-2">
            <Input
              name="quote"
              defaultValue={quote}
              placeholder="Trip fee (LKR)"
              aria-label="Trip fee (LKR)"
              className="w-36"
            />
            <Button type="submit" variant="secondary" disabled={quoting}>
              Save quote
            </Button>
          </form>
        )}
        {(status === "REQUESTED" || status === "QUOTED" || status === "FAILED") && (
          <form action={book}>
            <Button type="submit" disabled={booking}>
              Mark booked
            </Button>
          </form>
        )}
        {status === "BOOKED" && (
          <form action={pickedUp}>
            <Button type="submit" variant="secondary" disabled={picking}>
              Picked up
            </Button>
          </form>
        )}
        {status === "PICKED_UP" && (
          <form action={delivered}>
            <Button type="submit" variant="secondary" disabled={dropping}>
              Delivered
            </Button>
          </form>
        )}
        {(status === "BOOKED" || status === "PICKED_UP") && (
          <form action={renew}>
            <Button type="submit" variant="ghost">
              New courier link
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
