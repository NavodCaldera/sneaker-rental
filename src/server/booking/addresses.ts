import "server-only";
import type { Tx } from "../db";
import { BookingError } from "./errors";

/**
 * A customer's one address: where their pairs are delivered and collected. Trips copy it
 * when they are booked, so a later change affects only trips booked after it.
 */
export async function customerAddress(tx: Tx, userId: string): Promise<string> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.address) throw new BookingError(`${user.name} has no delivery address`);
  return user.address;
}

/** A merchant's one address: where their pairs are picked up and returned. */
export async function merchantAddress(tx: Tx, merchantId: string): Promise<string> {
  const merchant = await tx.merchant.findUniqueOrThrow({
    where: { id: merchantId },
    include: { user: true },
  });
  if (!merchant.user.address) {
    throw new BookingError(`${merchant.businessName} has no pickup address`);
  }
  return merchant.user.address;
}
