import "server-only";
import type { DeliveryType, PartyPays } from "@/generated/prisma/client";
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
    paidBy?: PartyPays;
    bookingFee?: string | null;
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
      paidBy: input.paidBy ?? "BORROWER",
      bookingFee: input.bookingFee ?? null,
      tripLog: [{ at: new Date().toISOString(), status: "REQUESTED" }],
    },
  });
}
