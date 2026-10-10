import { beforeEach, describe, expect, it } from "vitest";
import type { Delivery } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { BookingError, checkout, quoteBundle } from "@/server/booking/checkout";
import {
  endRental,
  markCleaned,
  onDeliveryDelivered,
  onDeliveryPickedUp,
  recordCondition,
} from "@/server/booking/lifecycle";
import { makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const photos = () => [new File([PNG as BlobPart], "c.png", { type: "image/png" })];
/** Noon in Colombo, `n` days after 1 Jan 2026. */
const day = (n: number) => new Date(Date.parse("2026-01-01T12:00:00+05:30") + n * 86_400_000);

async function makeShoe(
  merchantId: string,
  overrides: { value?: string; lifespanDays?: number } = {},
) {
  return db.shoe.create({
    data: {
      merchantId,
      brand: "Nike",
      model: "Pegasus 41",
      size: "UK 9",
      category: "Running",
      pickupAddress: "Shop, 12 Galle Road, Colombo 03",
      value: overrides.value ?? "6000",
      lifespanDays: overrides.lifespanDays ?? 365,
      status: "AVAILABLE",
    },
  });
}

async function deliveryFor(itemId: string, type: Delivery["type"]) {
  return db.delivery.findFirstOrThrow({ where: { rentalItemId: itemId, type } });
}

async function arrive(delivery: Delivery, at: Date) {
  await db.$transaction(async (tx) => {
    await onDeliveryPickedUp(tx, delivery);
    await tx.delivery.update({
      where: { id: delivery.id },
      data: { status: "DELIVERED", deliveredAt: at },
    });
    await onDeliveryDelivered(tx, { ...delivery, status: "DELIVERED" }, at);
  });
}

async function setup() {
  const merchant = await makeUser("MERCHANT");
  const borrower = await makeUser("BORROWER");
  return { merchant, merchantId: merchant.merchant!.id, borrower };
}

describe("rent, return and close (§5.2–5.4)", () => {
  it("a 100-day rental of a new 6,000 LKR shoe closes at 2,866.11, split 2,627.27 / 238.84", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);

    const rental = await checkout(borrower.id, [shoe.id], {
      deliveryAddress: "1 Flower Rd, Colombo 07",
      plannedDays: 100,
    });
    expect(rental.depositAmount.toString()).toBe("5000");
    const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
    expect((await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).status).toBe("RESERVED");

    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    expect((await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe(
      "ACTIVE",
    );
    await recordCondition(borrower.id, { itemId: item.id, grade: "A", photos: photos() }, day(0));

    await endRental(borrower.id, item.id, day(99));
    await arrive(await deliveryFor(item.id, "COLLECT"), day(100));
    expect((await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).status).toBe("CLEANING");

    const result = await recordCondition(
      merchant.id,
      { itemId: item.id, grade: "B", photos: photos() },
      day(100),
    );
    expect(result.closedItemIds).toEqual([item.id]);

    const closed = await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(closed.status).toBe("CLOSED");
    expect(closed.wearStart!.toString()).toBe("0");
    expect(closed.wearEnd!.toString()).toBe("100");
    expect(closed.charge!.toString()).toBe("2866.11");
    expect(closed.merchantShare!.toString()).toBe("2627.27");
    expect(closed.platformShare!.toString()).toBe("238.84");
    expect(closed.payableAt!.getTime() - day(100).getTime()).toBe(3 * 86_400_000);

    const after = await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } });
    expect(after.wear.toString()).toBe("100");
    expect(after.collectedSoFar.toString().startsWith("2866.114278")).toBe(true);
    expect(after.latestGrade).toBe("B");
    expect((await db.rental.findUniqueOrThrow({ where: { id: rental.id } })).status).toBe("CLOSED");

    await markCleaned(merchantId, shoe.id);
    expect((await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).status).toBe("AVAILABLE");
  });

  it("a 4-pair bundle held 10 days adds 2.5 wear-days to each pair, deposit 20,000", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const shoes = await Promise.all([1, 2, 3, 4].map(() => makeShoe(merchantId)));
    const quote = await quoteBundle(
      borrower.id,
      shoes.map((s) => s.id),
      10,
    );
    expect(quote.deposit).toBe("20000.00");
    // Four identical new pairs together cost one pair's daily price.
    expect(quote.dailyCost.slice(0, 7)).toBe("28.9247");

    const rental = await checkout(
      borrower.id,
      shoes.map((s) => s.id),
      { deliveryAddress: "1 Flower Rd", plannedDays: 10 },
    );
    const items = await db.rentalItem.findMany({ where: { rentalId: rental.id } });
    for (const item of items) await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    for (const item of items) {
      await endRental(borrower.id, item.id, day(9));
      await arrive(await deliveryFor(item.id, "COLLECT"), day(10));
      await recordCondition(
        merchant.id,
        { itemId: item.id, grade: "A", photos: photos() },
        day(10),
      );
    }
    for (const item of await db.rentalItem.findMany({ where: { rentalId: rental.id } })) {
      expect(item.wearEnd!.toString()).toBe("2.5");
    }
  });
});

describe("direct handoff chain (§5.3)", () => {
  it("A → B → C records continuous holdings with no idle days", async () => {
    const { merchantId } = await setup();
    const [a, b, c] = await Promise.all([
      makeUser("BORROWER"),
      makeUser("BORROWER"),
      makeUser("BORROWER"),
    ]);
    const shoe = await makeShoe(merchantId);

    const rentalA = await checkout(a.id, [shoe.id], {
      deliveryAddress: "A street",
      plannedDays: 30,
    });
    const itemA = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rentalA.id } });
    await arrive(await deliveryFor(itemA.id, "DELIVER"), day(0));

    // B reserves the pair while A holds it.
    const rentalB = await checkout(b.id, [shoe.id], {
      deliveryAddress: "B street",
      plannedDays: 20,
    });
    const itemB = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rentalB.id } });
    expect(itemB.status).toBe("WAITING_HANDOFF");
    await expect(
      checkout(c.id, [shoe.id], { deliveryAddress: "C street", plannedDays: 5 }),
    ).rejects.toThrow(/reserved next/);

    await endRental(a.id, itemA.id, day(29));
    const handoffAB = await deliveryFor(itemB.id, "HANDOFF");
    expect(handoffAB.fromRentalItemId).toBe(itemA.id);
    expect(handoffAB.fromAddress).toBe("A street");
    expect(handoffAB.toAddress).toBe("B street");
    await arrive(handoffAB, day(30));
    expect((await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).status).toBe(
      "WITH_BORROWER",
    );

    // B's receipt photos close A's rental.
    const r1 = await recordCondition(
      b.id,
      { itemId: itemB.id, grade: "A", photos: photos() },
      day(30),
    );
    expect(r1.closedItemIds).toEqual([itemA.id]);

    const rentalC = await checkout(c.id, [shoe.id], {
      deliveryAddress: "C street",
      plannedDays: 5,
    });
    const itemC = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rentalC.id } });
    await endRental(b.id, itemB.id, day(49));
    await arrive(await deliveryFor(itemC.id, "HANDOFF"), day(50));
    await recordCondition(c.id, { itemId: itemC.id, grade: "B", photos: photos() }, day(50));

    const [A, B, C] = await Promise.all(
      [itemA, itemB, itemC].map((i) => db.rentalItem.findUniqueOrThrow({ where: { id: i.id } })),
    );
    expect(A.endDate!.getTime()).toBe(B.startDate!.getTime());
    expect(B.endDate!.getTime()).toBe(C.startDate!.getTime());
    expect(A.wearEnd!.toString()).toBe("30");
    expect(B.wearStart!.toString()).toBe("30");
    expect(B.wearEnd!.toString()).toBe("50");
    expect(C.status).toBe("ACTIVE");
    // No trip back to the merchant between borrowers.
    expect(await db.delivery.count({ where: { type: "COLLECT" } })).toBe(0);
  });
});

describe("rules", () => {
  it("caps pairs held at once and rejects unavailable pairs", async () => {
    const { merchantId, borrower } = await setup();
    const shoes = await Promise.all([1, 2, 3, 4, 5].map(() => makeShoe(merchantId)));
    await checkout(
      borrower.id,
      shoes.slice(0, 3).map((s) => s.id),
      { deliveryAddress: "Home 123", plannedDays: 7 },
    );
    await expect(
      checkout(
        borrower.id,
        shoes.slice(3).map((s) => s.id),
        { deliveryAddress: "Home 123", plannedDays: 7 },
      ),
    ).rejects.toThrow(/up to 4 pairs/);

    const other = await makeUser("BORROWER");
    await expect(
      checkout(other.id, [shoes[0].id], { deliveryAddress: "Elsewhere", plannedDays: 7 }),
    ).rejects.toThrow(BookingError);
  });

  it("a damage flag opens a dispute on the closed item", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);
    const rental = await checkout(borrower.id, [shoe.id], {
      deliveryAddress: "Home 123",
      plannedDays: 7,
    });
    const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    await endRental(borrower.id, item.id, day(5));
    await arrive(await deliveryFor(item.id, "COLLECT"), day(6));
    await recordCondition(
      merchant.id,
      { itemId: item.id, grade: "C", photos: photos(), damageFlag: true, notes: "Torn heel" },
      day(6),
    );
    const dispute = await db.dispute.findFirstOrThrow({ where: { rentalItemId: item.id } });
    expect(dispute.status).toBe("OPEN");
    expect(dispute.reason).toMatch(/Torn heel/);
  });

  it("a pair that reaches end of life is retired, and its handoff reservation cancelled", async () => {
    const { merchant, merchantId } = await setup();
    const [a, b] = await Promise.all([makeUser("BORROWER"), makeUser("BORROWER")]);
    const shoe = await makeShoe(merchantId, { lifespanDays: 30 });
    const rentalA = await checkout(a.id, [shoe.id], {
      deliveryAddress: "A street",
      plannedDays: 30,
    });
    const itemA = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rentalA.id } });
    await arrive(await deliveryFor(itemA.id, "DELIVER"), day(0));
    const rentalB = await checkout(b.id, [shoe.id], {
      deliveryAddress: "B street",
      plannedDays: 5,
    });

    await endRental(a.id, itemA.id, day(40));
    const itemB = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rentalB.id } });
    expect(itemB.status).toBe("CANCELLED");
    await arrive(await deliveryFor(itemA.id, "COLLECT"), day(41));
    await recordCondition(merchant.id, { itemId: itemA.id, grade: "C", photos: photos() }, day(41));

    const closed = await db.rentalItem.findUniqueOrThrow({ where: { id: itemA.id } });
    expect(closed.wearEnd!.toString()).toBe("30"); // capped at L
    expect(closed.charge!.toFixed(2)).toBe("7200.00"); // the whole of R
    await markCleaned(merchantId, shoe.id);
    expect((await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).status).toBe("RETIRED");
  });

  it("only the right people can record condition", async () => {
    const { merchantId, borrower } = await setup();
    const stranger = await makeUser("BORROWER");
    const otherMerchant = await makeUser("MERCHANT");
    const shoe = await makeShoe(merchantId);
    const rental = await checkout(borrower.id, [shoe.id], {
      deliveryAddress: "Home 123",
      plannedDays: 7,
    });
    const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
    await expect(
      recordCondition(borrower.id, { itemId: item.id, grade: "A", photos: photos() }),
    ).rejects.toThrow(/once the pair arrives/);
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    await expect(
      recordCondition(stranger.id, { itemId: item.id, grade: "A", photos: photos() }),
    ).rejects.toThrow(/not found/);
    await expect(
      recordCondition(otherMerchant.id, { itemId: item.id, grade: "A", photos: photos() }),
    ).rejects.toThrow(/not found/);
    await expect(
      recordCondition(borrower.id, { itemId: item.id, grade: "A", photos: [] }),
    ).rejects.toThrow(/photo/);
  });
});
