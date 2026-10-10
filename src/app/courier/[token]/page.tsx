import type { Metadata } from "next";
import { Alert, Card } from "@/components/ui";
import { deliveryForToken } from "@/server/logistics";
import { CourierForm } from "./courier-form";

export const metadata: Metadata = { title: "Courier", robots: { index: false } };

const STEPS = {
  DELIVER: "Collect from the shop, deliver to the borrower.",
  COLLECT: "Collect from the borrower, return to the shop.",
  HANDOFF:
    "Collect from one borrower, deliver straight to the next. Keep the pair in the sealed bag with the cleaning kit.",
};

export default async function CourierPage({ params }: PageProps<"/courier/[token]">) {
  const { token } = await params;
  const delivery = await deliveryForToken(token);
  if (!delivery) {
    return (
      <main className="mx-auto w-full max-w-md">
        <Alert>
          This courier link has expired or isn&apos;t valid. Ask the dispatcher for a new one.
        </Alert>
      </main>
    );
  }
  const shoe = delivery.rentalItem.shoe;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {delivery.type === "HANDOFF"
            ? "Handoff trip"
            : delivery.type === "COLLECT"
              ? "Return trip"
              : "Delivery trip"}
        </h1>
        <p className="text-sm text-subtle">{STEPS[delivery.type]}</p>
      </div>
      <Card className="flex flex-col gap-3 text-sm">
        <div>
          <div className="text-subtle">Package</div>
          <div className="font-medium">
            {shoe.brand} {shoe.model} · {shoe.size}
          </div>
        </div>
        <div>
          <div className="text-subtle">1. Pick up</div>
          <div className="font-medium">{delivery.fromAddress}</div>
        </div>
        <div>
          <div className="text-subtle">2. Drop off</div>
          <div className="font-medium">{delivery.toAddress}</div>
        </div>
      </Card>
      {delivery.status === "BOOKED" && (
        <Card>
          <h2 className="mb-3 font-medium">At pickup</h2>
          <CourierForm token={token} step="pickup" handoff={delivery.type === "HANDOFF"} />
        </Card>
      )}
      {delivery.status === "PICKED_UP" && (
        <Card>
          <h2 className="mb-3 font-medium">At drop-off</h2>
          <CourierForm token={token} step="dropoff" handoff={delivery.type === "HANDOFF"} />
        </Card>
      )}
      {delivery.status === "DELIVERED" && <Alert tone="good">Delivered. Thank you!</Alert>}
      {(delivery.status === "CANCELLED" || delivery.status === "FAILED") && (
        <Alert>This trip was {delivery.status.toLowerCase()}. Contact the dispatcher.</Alert>
      )}
    </main>
  );
}
