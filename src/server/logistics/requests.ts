import "server-only";
import type { DeliveryType, PartyPays } from "@/generated/prisma/client";

/**
 * Who pays the driver: whoever receives the pair, directly in the ride-hailing app. The
 * platform never charges or collects trip fees.
 */
export function receiverPays(type: DeliveryType): PartyPays {
  return type === "COLLECT" ? "MERCHANT" : "BORROWER";
}
import type { Tx } from "../db";

/**
 * Creates a delivery request. Booking calls this; logistics (quotes, booking with a provider,
 * courier links, status events) takes it from there.
 */
export async function requestDelivery(
  tx: Tx,
  input: {
    type: DeliveryType;
    rentalItemId: string;
    fromRentalItemId?: string;
    fromAddress: string;
    toAddress: string;
  },
) {
  return tx.delivery.create({
    data: {
      type: input.type,
      provider: process.env.LOGISTICS_PROVIDER || "manual",
      rentalItemId: input.rentalItemId,
      fromRentalItemId: input.fromRentalItemId,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      paidBy: receiverPays(input.type),
      tripLog: [{ at: new Date().toISOString(), status: "REQUESTED" }],
    },
  });
}
