import { z } from "zod";

/** One address per account: house number and street, plus any directions a driver needs. */
export const addressSchema = z
  .string()
  .trim()
  .min(5, "Enter your house number and street")
  .max(300, "Keep it under 300 characters");

/** The town or city of the account's address. */
export const citySchema = z
  .string()
  .trim()
  .min(2, "Enter your city")
  .max(60, "Keep it under 60 characters");

/** Why we ask for the address, shown next to the field (sign-up and account pages). */
export const ADDRESS_REASON = {
  BORROWER: "",
  MERCHANT:
    "Drivers pick up your shoes from this address for each rental and bring them back here afterwards. Only the drivers who carry your pairs see it.",
} as const;

export const ADDRESS_LABEL = {
  BORROWER: "Delivery and collection address",
  MERCHANT: "Pickup and return address",
} as const;

/** The address a driver uses: street address, then the city (when the account has one). */
export function fullAddress(account: { address: string | null; city: string | null }) {
  if (!account.address) return null;
  return account.city ? `${account.address}, ${account.city}` : account.address;
}
