import "server-only";
import { z } from "zod";
import { D, toD } from "@/lib/decimal";
import { db } from "../db";
import { chargeDamage, refundItem, releaseAfterDispute } from "../payments";
import { merchantPartOfRefund } from "../payouts";

export class DisputeError extends Error {}

/**
 * §6 Disputes: either side opens one within the dispute window after a rental closes.
 * The item's payout is held until an admin decides.
 */
export async function openDispute(
  userId: string,
  itemId: string,
  reason: string,
  now = new Date(),
) {
  const text = reason.trim();
  if (text.length < 10) throw new DisputeError("Describe the problem in a sentence or two");
  const item = await db.rentalItem.findUnique({
    where: { id: itemId },
    include: {
      rental: true,
      shoe: { include: { merchant: true } },
      disputes: { where: { status: "OPEN" } },
    },
  });
  if (!item) throw new DisputeError("Rental not found");
  const isBorrower = item.rental.borrowerId === userId;
  const isMerchant = item.shoe.merchant.userId === userId;
  if (!isBorrower && !isMerchant) throw new DisputeError("Rental not found");
  if (item.status !== "CLOSED" && item.status !== "LOST")
    throw new DisputeError("You can open a dispute once the rental closes");
  if (!item.payableAt || now > item.payableAt)
    throw new DisputeError("The dispute window for this rental has closed");
  if (item.payoutId) throw new DisputeError("This rental has already been paid out");
  if (item.disputes.length > 0)
    throw new DisputeError("There's already an open dispute for this rental");
  return db.dispute.create({ data: { rentalItemId: itemId, openedById: userId, reason: text } });
}

export const decisionSchema = z.discriminatedUnion("resolution", [
  z.object({
    resolution: z.literal("CHARGE_DEPOSIT"),
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount"),
    decision: z.string().trim().min(5, "Explain the decision"),
  }),
  z.object({
    resolution: z.literal("REFUND_BORROWER"),
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount"),
    decision: z.string().trim().min(5, "Explain the decision"),
  }),
  z.object({
    resolution: z.literal("NO_ACTION"),
    decision: z.string().trim().min(5, "Explain the decision"),
  }),
]);

export type Decision = z.infer<typeof decisionSchema>;

/**
 * An admin decides after reviewing the photos and trip log.
 * - CHARGE_DEPOSIT: charge up to the pair's merchant value from the borrower's locked tokens
 *   (then their free balance); the amount is added to the merchant's payout.
 * - REFUND_BORROWER: give back up to what was charged, as tokens. Up to this rental's merchant share comes
 *   off the merchant's payout and their running total, so later rentals of the shoe pay them
 *   back first (merchant first); any more is the platform's cost.
 * - NO_ACTION: dispute rejected.
 * Then the pair's locked value is released and the payout unblocked.
 */
export async function decideDispute(
  adminId: string,
  disputeId: string,
  input: Decision,
  now = new Date(),
) {
  const dispute = await db.dispute.findUniqueOrThrow({
    where: { id: disputeId },
    include: { rentalItem: true },
  });
  if (dispute.status !== "OPEN") throw new DisputeError("This dispute has already been decided");
  const item = dispute.rentalItem;

  let amount: string | null = null;
  if (input.resolution === "CHARGE_DEPOSIT") {
    const charged = await chargeDamage(item.id, input.amount, `dispute:${dispute.id}`);
    amount = charged.toFixed(2);
  } else if (input.resolution === "REFUND_BORROWER") {
    if (new D(input.amount).gt(toD(item.charge ?? 0))) {
      throw new DisputeError("A refund can't be more than this rental's charge");
    }
    const refunded = await refundItem(item.id, input.amount, `dispute:${dispute.id}`);
    amount = refunded ? refunded.toFixed(2) : "0.00";
    const fromMerchant = merchantPartOfRefund(amount, item.merchantShare ?? 0);
    if (fromMerchant.gt(0)) {
      const shoe = await db.shoe.findUniqueOrThrow({ where: { id: item.shoeId } });
      await db.shoe.update({
        where: { id: shoe.id },
        data: { merchantCollected: toD(shoe.merchantCollected).minus(fromMerchant).toFixed(2) },
      });
    }
  }

  const decided = await db.dispute.update({
    where: { id: disputeId },
    data: {
      status: input.resolution === "NO_ACTION" ? "REJECTED" : "UPHELD",
      resolution: input.resolution,
      amount,
      decision: input.decision,
      decidedById: adminId,
      decidedAt: now,
    },
  });
  await releaseAfterDispute(item.id);
  return decided;
}

export async function listDisputes(scope: "open" | "decided") {
  return db.dispute.findMany({
    where: scope === "open" ? { status: "OPEN" } : { status: { not: "OPEN" } },
    orderBy: { createdAt: scope === "open" ? "asc" : "desc" },
    take: scope === "open" ? undefined : 50,
    include: {
      openedBy: { select: { name: true, role: true } },
      decidedBy: { select: { name: true } },
      rentalItem: {
        include: {
          rental: { include: { borrower: { select: { name: true } } } },
          shoe: {
            include: {
              merchant: { select: { businessName: true } },
              photos: { where: { kind: { in: ["FRONT", "SIDE", "SOLE", "INSIDE", "BOX"] } } },
            },
          },
          conditionReports: { include: { photos: true }, orderBy: { createdAt: "asc" } },
          deliveries: { include: { photos: true } },
          outgoing: { include: { photos: true } },
          walletEntries: { where: { kind: "CHARGE" }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
}
