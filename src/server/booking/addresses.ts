import "server-only";
import { fullAddress } from "@/lib/address";
import type { Tx } from "../db";
import { BookingError } from "./errors";

/**
 * A customer's one address (street address, then city): where their pairs are delivered and collected. Trips copy it
 * when they are booked, so a later change affects only trips booked after it.
 */
export async function customerAddress(tx: Tx, userId: string): Promise<string> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const address = fullAddress(user);
  if (!address) throw new BookingError(`${user.name} has no delivery address`);
  return address;
}

/** A merchant's one address: where their pairs are picked up and returned. */
export async function merchantAddress(tx: Tx, merchantId: string): Promise<string> {
  const merchant = await tx.merchant.findUniqueOrThrow({
    where: { id: merchantId },
    include: { user: true },
  });
  const address = fullAddress(merchant.user);
  if (!address) throw new BookingError(`${merchant.businessName} has no pickup address`);
  return address;
}
