import { z } from "zod";

/** One address per account: street, town and any directions a driver needs. */
export const addressSchema = z
  .string()
  .trim()
  .min(10, "Enter your full address: street and town")
  .max(300, "Keep it under 300 characters");

/** Why we ask for the address, shown next to the field (sign-up and account pages). */
export const ADDRESS_REASON = {
  BORROWER:
    "We deliver your sneakers to this address and collect them from here when your rental ends. Only the drivers who carry your pairs see it.",
  MERCHANT:
    "Drivers pick up your shoes from this address for each rental and bring them back here afterwards. Only the drivers who carry your pairs see it.",
} as const;

export const ADDRESS_LABEL = {
  BORROWER: "Delivery and collection address",
  MERCHANT: "Pickup and return address",
} as const;
