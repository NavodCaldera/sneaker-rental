import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { BookingError, checkout, quoteBundle } from "@/server/booking/checkout";
import { endRental, markCleaned, recordCondition } from "@/server/booking/lifecycle";
import { borrowerRentals } from "@/server/booking/queries";
import { D } from "@/lib/decimal";
import { DEFAULT_PRICING_SETTINGS, curveParams, incomeBetween } from "@/lib/pricing";
import { browseShoes } from "@/server/catalogue";
import { colomboDay, dateToDay } from "@/lib/wear-ledger";
import { arrive, day, deliveryFor, makeShoe, makeUser, photos, resetDb, setup } from "./helpers";

beforeEach(resetDb);

describe("rent, return and close (§5.2–5.4)", () => {
  it("a 100-day rental (days 0–99) of a new 6,000 LKR shoe charges 2,866.11, all to the merchant", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);

    const rental = await checkout(borrower.id, [shoe.id], {
      deliveryAddress: "1 Flower Rd, Colombo 07",
      plannedDays: 100,
    });
    expect(rental.depositAmount.toString()).toBe("5000");
    expect(rental.estimate.toFixed(2)).toBe("2866.11"); // estimate = final when the plan is kept
    const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
    expect((await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).status).toBe("RESERVED");

    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    expect((await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe(
      "ACTIVE",
    );
    await recordCondition(borrower.id, { itemId: item.id, grade: "A", photos: photos() }, day(0));

    // Ended on day 99; the driver collects on day 100 and the merchant inspects the same
    // day. The borrower pays for days 0–99 only: waiting for the driver is free.
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
    // Merchant first: the merchant is owed 6,600 and gets all of it; the platform nothing yet.
    expect(closed.merchantShare!.toString()).toBe("2866.11");
    expect(closed.platformShare!.toString()).toBe("0");
    expect(closed.payableAt!.getTime() - day(100).getTime()).toBe(3 * 86_400_000);

    const after = await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } });
    expect(after.wear.toString()).toBe("100");
    expect(after.collectedSoFar.toString().startsWith("2866.114278")).toBe(true);
    expect(after.merchantCollected.toString()).toBe("2866.11");
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
  it("A → B → C: each holding ends when the borrower ends it; days waiting for the driver are free", async () => {
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
    await arrive(handoffAB, day(31)); // two days waiting at A's house: nobody pays
    expect((await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).status).toBe(
      "WITH_BORROWER",
    );

    // B's receipt photos close A's rental.
    const r1 = await recordCondition(
      b.id,
      { itemId: itemB.id, grade: "A", photos: photos() },
      day(31),
    );
    expect(r1.closedItemIds).toEqual([itemA.id]);

    const rentalC = await checkout(c.id, [shoe.id], {
      deliveryAddress: "C street",
      plannedDays: 5,
    });
    const itemC = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rentalC.id } });
    // B ends on the handoff day itself: C starts the next day, never both on one day.
    await endRental(b.id, itemB.id, day(50));
    await arrive(await deliveryFor(itemC.id, "HANDOFF"), day(50));
    await recordCondition(c.id, { itemId: itemC.id, grade: "B", photos: photos() }, day(50));

    const [A, B, C] = await Promise.all(
      [itemA, itemB, itemC].map((i) => db.rentalItem.findUniqueOrThrow({ where: { id: i.id } })),
    );
    expect(A.endDate!.getTime()).toBe(B.startDate!.getTime());
    expect(B.endDate!.getTime()).toBe(C.startDate!.getTime());
    // Ledger days: A 0–29, nobody 30, B 31–50, C from 51.
    expect(dateToDay(A.lastDay!)).toBe(colomboDay(day(29)));
    expect(dateToDay(B.firstDay!)).toBe(colomboDay(day(31)));
    expect(dateToDay(B.lastDay!)).toBe(colomboDay(day(50)));
    expect(dateToDay(C.firstDay!)).toBe(dateToDay(B.lastDay!) + 1);
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
    const shoe = await makeShoe(merchantId, { lifespanDays: 60 });
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

    await endRental(a.id, itemA.id, day(70));
    const itemB = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rentalB.id } });
    expect(itemB.status).toBe("CANCELLED");
    await arrive(await deliveryFor(itemA.id, "COLLECT"), day(71));
    await recordCondition(merchant.id, { itemId: itemA.id, grade: "C", photos: photos() }, day(71));

    const closed = await db.rentalItem.findUniqueOrThrow({ where: { id: itemA.id } });
    expect(closed.wearEnd!.toString()).toBe("60"); // capped at L
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

describe("rent calculation rules (pricing-spec.md)", () => {
  it("same-day delivery and return counts as one wear-day", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);
    const rental = await checkout(borrower.id, [shoe.id], {
      deliveryAddress: "Home 123",
      plannedDays: 1,
    });
    const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    await endRental(borrower.id, item.id, day(0));
    await arrive(await deliveryFor(item.id, "COLLECT"), day(0));
    await recordCondition(merchant.id, { itemId: item.id, grade: "A", photos: photos() }, day(0));
    const closed = await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(closed.wearEnd!.toString()).toBe("1");
    expect(closed.charge!.toFixed(2)).toBe("28.92"); // ≈ K for one new wear-day
  });

  it("worked example through booking: A 216.89 + B (second-hand, wear 50 → 52.5) 95.81", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const a = await makeShoe(merchantId);
    const b = await makeShoe(merchantId, { value: "8000", initialWear: "50" });
    // Worked example: A days 1–10, B days 6–10, one borrower.
    const r1 = await checkout(borrower.id, [a.id], {
      deliveryAddress: "Home 123",
      plannedDays: 10,
    });
    const itemA = await db.rentalItem.findFirstOrThrow({ where: { rentalId: r1.id } });
    await arrive(await deliveryFor(itemA.id, "DELIVER"), day(1));
    const r2 = await checkout(borrower.id, [b.id], { deliveryAddress: "Home 123", plannedDays: 5 });
    const itemB = await db.rentalItem.findFirstOrThrow({ where: { rentalId: r2.id } });
    await arrive(await deliveryFor(itemB.id, "DELIVER"), day(6));
    for (const item of [itemA, itemB]) {
      await endRental(borrower.id, item.id, day(10));
      await arrive(await deliveryFor(item.id, "COLLECT"), day(10));
      await recordCondition(
        merchant.id,
        { itemId: item.id, grade: "A", photos: photos() },
        day(10),
      );
    }
    const [A, B] = await Promise.all(
      [itemA, itemB].map((i) => db.rentalItem.findUniqueOrThrow({ where: { id: i.id } })),
    );
    expect(A.wearEnd!.toString()).toBe("7.5");
    expect(B.wearStart!.toString()).toBe("50");
    expect(B.wearEnd!.toString()).toBe("52.5");
    expect([A.charge, A.merchantShare, A.platformShare].map((x) => x!.toFixed(2))).toEqual([
      "216.89",
      "216.89",
      "0.00",
    ]);
    expect([B.charge, B.merchantShare, B.platformShare].map((x) => x!.toFixed(2))).toEqual([
      "95.81",
      "95.81",
      "0.00",
    ]);
  });

  it("the estimate counts pairs already held: a second pair for 10 days gains 5 wear-days", async () => {
    const { merchantId, borrower } = await setup();
    const [held, next] = await Promise.all([makeShoe(merchantId), makeShoe(merchantId)]);
    await checkout(borrower.id, [held.id], { deliveryAddress: "Home 123", plannedDays: 10 });
    const alone = await quoteBundle(null, [next.id], 5);
    const shared = await quoteBundle(borrower.id, [next.id], 10);
    // 5 days alone and 10 days shared with one other pair both add 5 wear-days.
    expect(shared.estimate).toBe(alone.estimate);
    expect(shared.totalPairs).toBe(2);
  });

  it("the running bill counts today, as if the pair reached the next holder today", async () => {
    const { merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);
    const rental = await checkout(borrower.id, [shoe.id], {
      deliveryAddress: "Home 123",
      plannedDays: 30,
    });
    const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    const [view] = await borrowerRentals(borrower.id, day(9));
    expect(view.items[0].live!.wearSoFar).toBe("10");
  });
});

describe("merchant first and free waiting days", () => {
  it("days between ending a rental and the driver collecting are free and add no wear", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);
    const rental = await checkout(borrower.id, [shoe.id], {
      deliveryAddress: "Home 123",
      plannedDays: 10,
    });
    const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    await endRental(borrower.id, item.id, day(9));
    // The running bill stops on the day the rental ended.
    const [view] = await borrowerRentals(borrower.id, day(14));
    expect(view.items[0].live!.wearSoFar).toBe("10");
    await arrive(await deliveryFor(item.id, "COLLECT"), day(15));
    await recordCondition(merchant.id, { itemId: item.id, grade: "A", photos: photos() }, day(15));
    const closed = await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(closed.wearEnd!.toString()).toBe("10");
  });

  it("the platform earns only once the merchant has been paid (1 + μm) × V", async () => {
    const { merchant, merchantId } = await setup();
    // A short-lived 6,000 LKR shoe: target 6,600, rented to end of life by two borrowers.
    const shoe = await makeShoe(merchantId, { lifespanDays: 60 });
    const shares: string[][] = [];
    for (const [start, end] of [
      [0, 39],
      [50, 69],
    ]) {
      const b = await makeUser("BORROWER");
      // Booked before the previous plan's release window, so no release discount applies.
      const rental = await checkout(
        b.id,
        [shoe.id],
        { deliveryAddress: "Home 123", plannedDays: 60 },
        day(start - 1),
      );
      const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
      await arrive(await deliveryFor(item.id, "DELIVER"), day(start));
      await endRental(b.id, item.id, day(end));
      await arrive(await deliveryFor(item.id, "COLLECT"), day(end));
      await recordCondition(
        merchant.id,
        { itemId: item.id, grade: "A", photos: photos() },
        day(end),
      );
      const closed = await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } });
      shares.push(
        [closed.charge!, closed.merchantShare!, closed.platformShare!].map((x) => x.toFixed(2)),
      );
      await db.shoe.update({ where: { id: shoe.id }, data: { status: "AVAILABLE" } });
    }
    const [first, second] = shares;
    expect(first[1]).toBe(first[0]); // all to the merchant
    expect(first[2]).toBe("0.00");
    // Second rental takes the shoe to end of life: merchant reaches 6,600, platform gets 600.
    expect(new D(first[1]).plus(second[1]).toFixed(2)).toBe("6600.00");
    expect(second[2]).toBe("600.00");
    const after = await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } });
    expect(after.merchantCollected.toFixed(2)).toBe("6600.00");
  });
});

describe("release discount for the next borrower (pricing-spec.md §8)", () => {
  it("a 90-day rental opens for reservations on day 81 at 0.5% off; the next borrower keeps the rate", async () => {
    const { merchant, merchantId } = await setup();
    const [a, b] = await Promise.all([makeUser("BORROWER"), makeUser("BORROWER")]);
    const shoe = await makeShoe(merchantId);
    // A plans 90 days and gets the pair on day 0: days 0–89, release day 89.
    const rentalA = await checkout(
      a.id,
      [shoe.id],
      { deliveryAddress: "A street", plannedDays: 90 },
      day(0),
    );
    const itemA = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rentalA.id } });
    expect(itemA.plannedDays).toBe(90);
    await arrive(await deliveryFor(itemA.id, "DELIVER"), day(0));
    const held = await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } });
    expect(dateToDay(held.releaseDay!)).toBe(colomboDay(day(89)));

    // Hidden until A's 81st day (day 80), then shown at 0.5% off, rising 0.5% a day.
    expect((await browseShoes({}, day(79))).map((s) => s.id)).not.toContain(shoe.id);
    await expect(
      checkout(b.id, [shoe.id], { deliveryAddress: "B street", plannedDays: 10 }, day(79)),
    ).rejects.toThrow(/opens for reservations/);
    expect((await browseShoes({}, day(80))).map((s) => s.id)).toContain(shoe.id);
    const discountOn = async (d: number) =>
      (await quoteBundle(null, [shoe.id], 10, undefined, day(d))).lines[0].discount;
    expect(await discountOn(80)).toBe("0.005");
    expect(await discountOn(89)).toBe("0.05"); // release day
    expect(await discountOn(99)).toBe("0.1");
    expect(await discountOn(200)).toBe("0.1"); // steady at the maximum

    // B reserves on day 84 (2.5% off) and keeps that rate for the whole rental.
    const rentalB = await checkout(
      b.id,
      [shoe.id],
      { deliveryAddress: "B street", plannedDays: 10 },
      day(84),
    );
    const itemB = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rentalB.id } });
    expect(itemB.discount.toString()).toBe("0.025");
    expect(itemB.discountFunding).toBe("PLATFORM");

    await endRental(a.id, itemA.id, day(89));
    await arrive(await deliveryFor(itemB.id, "HANDOFF"), day(90));
    await recordCondition(b.id, { itemId: itemB.id, grade: "A", photos: photos() }, day(90));
    await endRental(b.id, itemB.id, day(99));
    await arrive(await deliveryFor(itemB.id, "COLLECT"), day(99));
    await recordCondition(merchant.id, { itemId: itemB.id, grade: "A", photos: photos() }, day(99));

    const B = await db.rentalItem.findUniqueOrThrow({ where: { id: itemB.id } });
    expect([B.wearStart!.toString(), B.wearEnd!.toString()]).toEqual(["90", "100"]);
    const p = curveParams(6000, 365, DEFAULT_PRICING_SETTINGS);
    const expected = incomeBetween(p, 90, 100, "0.025");
    expect(B.chargeExact!.toString().slice(0, 12)).toBe(expected.income.toString().slice(0, 12));
    expect(B.discountCost!.toString().slice(0, 10)).toBe(
      expected.discountCost.toString().slice(0, 10),
    );
    // B's own 10-day plan sets the next release day.
    const after = await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } });
    expect(dateToDay(after.releaseDay!)).toBe(colomboDay(day(90)) + 9);
  });

  it("a pair back with the merchant keeps counting from the planned release; a new pair has none", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const [shoe, fresh] = await Promise.all([makeShoe(merchantId), makeShoe(merchantId)]);
    const rental = await checkout(
      borrower.id,
      [shoe.id],
      { deliveryAddress: "Home 123", plannedDays: 30 },
      day(0),
    );
    const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    await endRental(borrower.id, item.id, day(20)); // back early
    await arrive(await deliveryFor(item.id, "COLLECT"), day(21));
    await recordCondition(merchant.id, { itemId: item.id, grade: "A", photos: photos() }, day(21));
    await markCleaned(merchantId, shoe.id);
    // Planned release day 29: window opens day 20; on day 49 (20 days in) it is 10%.
    const q = await quoteBundle(null, [shoe.id, fresh.id], 5, undefined, day(49));
    expect(q.lines.map((l) => l.discount)).toEqual(["0.1", "0"]);
    expect(new D(q.lines[0].priceToday).lt(q.lines[0].priceBeforeDiscount)).toBe(true);
  });
});
