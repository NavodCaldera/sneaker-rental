import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { BookingError, checkout } from "@/server/booking/checkout";
import { endRental, recordCondition } from "@/server/booking/lifecycle";
import { finishRentalIfDone, markLost, settleItems } from "@/server/payments";
import { MockGateway, setGatewayForTests } from "@/server/payments/gateway";
import { arrive, day, deliveryFor, makeShoe, makeUser, photos, resetDb, setup } from "./helpers";

beforeEach(resetDb);
afterEach(() => setGatewayForTests(undefined));

async function rentOne(borrowerId: string, shoeId: string) {
  const rental = await checkout(borrowerId, [shoeId], {
    deliveryAddress: "1 Flower Rd",
    plannedDays: 30,
  });
  const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
  return { rental, item };
}

const kinds = async (rentalId: string) =>
  (
    await db.payment.findMany({
      where: { rentalId, status: "SUCCEEDED" },
      orderBy: { createdAt: "asc" },
    })
  ).map((p) => `${p.kind} ${p.amount.toFixed(2)}`);

describe("checkout → return → charge → deposit release (mock gateway)", () => {
  it("pre-authorises the estimate, holds the deposit, captures at return and releases the deposit", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);
    const { rental, item } = await rentOne(borrower.id, shoe.id);
    expect(rental.status).toBe("ACTIVE");
    expect(rental.preAuthRef).toMatch(/^mock_/);
    expect(rental.depositHoldRef).toMatch(/^mock_/);
    expect(await kinds(rental.id)).toEqual([
      `PREAUTH ${rental.estimate.toFixed(2)}`,
      "DEPOSIT_HOLD 5000.00",
    ]);

    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    await endRental(borrower.id, item.id, day(98));
    await arrive(await deliveryFor(item.id, "COLLECT"), day(99));
    await recordCondition(merchant.id, { itemId: item.id, grade: "B", photos: photos() }, day(99));

    expect(await kinds(rental.id)).toEqual([
      `PREAUTH ${rental.estimate.toFixed(2)}`,
      "DEPOSIT_HOLD 5000.00",
      "CAPTURE 2866.11",
      "DEPOSIT_RELEASE 5000.00",
      "PREAUTH_VOID 0.00",
    ]);

    // Idempotent: settling again doesn't charge twice.
    await settleItems([item.id]);
    expect(await db.payment.count({ where: { rentalId: rental.id, kind: "CAPTURE" } })).toBe(1);
  });

  it("a declined card cancels the booking and frees the pair", async () => {
    const { merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);
    setGatewayForTests({
      ...new MockGateway(),
      name: "mock",
      preAuthorise: async () => ({ ok: false as const, error: "Card declined" }),
      capture: async () => ({ ok: false as const, error: "n/a" }),
      void: async () => ({ ok: false as const, error: "n/a" }),
      refund: async () => ({ ok: false as const, error: "n/a" }),
    });
    await expect(rentOne(borrower.id, shoe.id)).rejects.toThrow(BookingError);
    const rental = await db.rental.findFirstOrThrow({ where: { borrowerId: borrower.id } });
    expect(rental.status).toBe("CANCELLED");
    expect((await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).status).toBe("AVAILABLE");
    expect(await db.delivery.count({ where: { status: { not: "CANCELLED" } } })).toBe(0);
    expect(await db.payment.count({ where: { status: "FAILED" } })).toBe(1);
  });

  it("keeps the deposit held while a dispute is open", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);
    const { rental, item } = await rentOne(borrower.id, shoe.id);
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    await endRental(borrower.id, item.id, day(9));
    await arrive(await deliveryFor(item.id, "COLLECT"), day(10));
    await recordCondition(
      merchant.id,
      { itemId: item.id, grade: "C", photos: photos(), damageFlag: true },
      day(10),
    );
    expect(await kinds(rental.id)).not.toContain("DEPOSIT_RELEASE 5000.00");

    await db.dispute.updateMany({ where: { rentalItemId: item.id }, data: { status: "REJECTED" } });
    expect(await finishRentalIfDone(rental.id)).toBe(true);
    expect(await kinds(rental.id)).toContain("DEPOSIT_RELEASE 5000.00");
  });
});

describe("lost pair (§4 rule 3)", () => {
  it("charges R − F(w): deposit first, then the card; merchant made whole, account locked", async () => {
    const { merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);
    const { rental, item } = await rentOne(borrower.id, shoe.id);
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));

    const lost = await markLost(item.id, day(20));
    expect(lost.status).toBe("LOST");
    expect(lost.charge!.toFixed(2)).toBe("7200.00"); // new shoe: the whole of R
    expect(lost.merchantShare!.toFixed(2)).toBe("6600.00");
    expect(lost.platformShare!.toFixed(2)).toBe("600.00");

    expect(await kinds(rental.id)).toEqual([
      `PREAUTH ${rental.estimate.toFixed(2)}`,
      "DEPOSIT_HOLD 5000.00",
      "DEPOSIT_CAPTURE 5000.00",
      "CAPTURE 2200.00",
      "DEPOSIT_RELEASE 0.00",
      "PREAUTH_VOID 0.00",
    ]);
    const after = await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } });
    expect(after.status).toBe("RETIRED");
    expect(after.collectedSoFar.toFixed(2)).toBe("7200.00");
    expect((await db.user.findUniqueOrThrow({ where: { id: borrower.id } })).locked).toBe(true);
    await expect(
      checkout(borrower.id, [(await makeShoe(merchantId)).id], {
        deliveryAddress: "x x x x x",
        plannedDays: 1,
      }),
    ).rejects.toThrow(/locked/);
  });

  it("a worn pair costs less to lose", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const other = await makeUser("BORROWER");
    const shoe = await makeShoe(merchantId);
    // First borrower wears it for 100 days and returns it.
    const first = await rentOne(other.id, shoe.id);
    await arrive(await deliveryFor(first.item.id, "DELIVER"), day(0));
    await endRental(other.id, first.item.id, day(98));
    await arrive(await deliveryFor(first.item.id, "COLLECT"), day(99));
    await recordCondition(
      merchant.id,
      { itemId: first.item.id, grade: "B", photos: photos() },
      day(99),
    );
    await db.shoe.update({ where: { id: shoe.id }, data: { status: "AVAILABLE" } });

    const { item } = await rentOne(borrower.id, shoe.id);
    await arrive(await deliveryFor(item.id, "DELIVER"), day(101));
    const lost = await markLost(item.id, day(110));
    // R − F(100) = 7,200 − 2,866.11
    expect(lost.charge!.toFixed(2)).toBe("4333.89");
  });
});
