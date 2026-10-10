import "server-only";
import { db } from "../db";

/** Counts and active rentals for the admin overview. */
export async function adminOverview() {
  const [openDeliveries, openDisputes, activeItems, available, merchantsPending] =
    await Promise.all([
      db.delivery.count({
        where: { status: { in: ["REQUESTED", "QUOTED", "BOOKED", "PICKED_UP", "FAILED"] } },
      }),
      db.dispute.count({ where: { status: "OPEN" } }),
      db.rentalItem.findMany({
        where: { status: { in: ["ACTIVE", "RETURNING"] } },
        orderBy: { startDate: "asc" },
        include: {
          shoe: { select: { brand: true, model: true, size: true } },
          rental: { include: { borrower: { select: { name: true, email: true } } } },
        },
      }),
      db.shoe.count({ where: { status: "AVAILABLE" } }),
      db.merchant.count({ where: { verified: false } }),
    ]);
  return { openDeliveries, openDisputes, activeItems, available, merchantsPending };
}
