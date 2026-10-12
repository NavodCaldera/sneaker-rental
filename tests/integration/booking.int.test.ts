import { beforeEach, describe, expect, it } from "vitest";
import { fullAddress } from "@/lib/address";
import { db } from "@/server/db";
import { BookingError, checkout, quoteBundle } from "@/server/booking/checkout";
import { runDailyRentals } from "@/server/booking/daily";
import {
  endRental,
  markCleaned,
  recordCondition,
  scheduleEarlyReturn,
} from "@/server/booking/lifecycle";
import { D } from "@/lib/decimal";
import { DEFAULT_PRICING_SETTINGS, curveParams, incomeBetween, priceAt } from "@/lib/pricing";
import { browseShoes } from "@/server/catalogue";
import { pairLocked, rentLockedFor, rentalLocked, walletBalance } from "@/server/wallet";
import { colomboDay, dateToDay } from "@/lib/wear-ledger";
import {
  arrive,
  day,
  deliveryFor,
  isoDay,
  makeShoe,
  makeUser,
  photos,
  resetDb,
  setup,
} from "./helpers";

beforeEach(resetDb);

describe("rent, return and close (§5.2–5.4)", () => {
  it("a 100-day term (days 1–100) of a new 6,000 LKR shoe: 2,866.11 locked at booking, charged at return, all to the merchant", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);

    const rental = await checkout(borrower.id, [shoe.id], { plannedDays: 100 }, day(-1));
    // The pair's value (deposit) and the term's rent estimate are locked; nothing is charged.
    expect(rental.shoeValue.toString()).toBe("6000");
    expect(rental.estimatedRent.toFixed(2)).toBe("2866.11");
    expect((await rentalLocked(rental.id)).toFixed(2)).toBe("8866.11");
    const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
    expect((await pairLocked(item.id)).toFixed(2)).toBe("6000.00");
    expect((await rentLockedFor(item.id)).toFixed(2)).toBe("2866.11");
    expect(item.rentLocked.toFixed(2)).toBe("2866.11");
    expect(item.rentPaid.toFixed(2)).toBe("0.00");
    expect((await walletBalance(borrower.id)).balance.toFixed(2)).toBe("1000000.00");
    expect(await db.walletEntry.count({ where: { userId: borrower.id, kind: "CHARGE" } })).toBe(0);
    const reserved = await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } });
    expect(reserved.status).toBe("RESERVED");
    // The wear is committed the moment the term is paid for: 100 of 365 used.
    expect(reserved.committedWear.toString()).toBe("100");
    expect(reserved.wear.toString()).toBe("0");

    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    const active = await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(active.status).toBe("ACTIVE");
    // Day 1 is the day after delivery; the term ends on day 100.
    expect(dateToDay(active.firstDay!)).toBe(colomboDay(day(1)));
    expect(dateToDay(active.termEndDay!)).toBe(colomboDay(day(100)));
    await recordCondition(borrower.id, { itemId: item.id, grade: "A", photos: photos() }, day(0));

    // Ended on day 100; the driver collects on day 101 and the merchant inspects the same
    // day. The borrower pays for days 1–100 only: waiting for the driver is free.
    await endRental(borrower.id, item.id, day(100));
    const collect = await deliveryFor(item.id, "COLLECT");
    expect(collect.paidBy).toBe("MERCHANT"); // the merchant receiving it pays the driver
    await arrive(collect, day(101));
    expect((await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).status).toBe("CLEANING");

    const result = await recordCondition(
      merchant.id,
      { itemId: item.id, grade: "B", photos: photos() },
      day(101),
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
    // Charged now, at return: both locks released, the rent taken from the balance.
    expect(closed.rentPaid.toFixed(2)).toBe("2866.11");
    expect(closed.rentLocked.toFixed(2)).toBe("0.00");
    expect(closed.payableAt!.getTime() - day(101).getTime()).toBe(3 * 86_400_000);
    expect((await walletBalance(borrower.id)).balance.toFixed(2)).toBe("997133.89");
    expect((await walletBalance(borrower.id)).locked.toFixed(2)).toBe("0.00");
    const rent = await db.walletEntry.findFirstOrThrow({
      where: { rentalItemId: item.id, kind: "CHARGE" },
    });
    expect([rent.amount.toFixed(2), rent.note]).toEqual(["2866.11", "Rent: Nike Pegasus 41"]);

    const after = await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } });
    expect(after.wear.toString()).toBe("100");
    expect(after.committedWear.toString()).toBe("100");
    expect(after.collectedSoFar.toString().startsWith("2866.114278")).toBe(true);
    expect(after.merchantCollected.toString()).toBe("2866.11");
    expect(after.latestGrade).toBe("B");
    expect((await db.rental.findUniqueOrThrow({ where: { id: rental.id } })).status).toBe("CLOSED");

    await markCleaned(merchantId, shoe.id);
    expect((await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).status).toBe("AVAILABLE");
  });

  it("a 4-pair bundle held 10 days adds 2.5 wear-days to each pair; locks 24,000 + the rent estimate", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const shoes = await Promise.all([1, 2, 3, 4].map(() => makeShoe(merchantId)));
    const quote = await quoteBundle(
      borrower.id,
      shoes.map((s) => s.id),
      10,
    );
    expect(quote.shoeValue).toBe("24000.00");
    expect(quote.required).toBe(new D(quote.shoeValue).plus(quote.estimate).toFixed(2));
    // Four identical new pairs together cost one pair's daily price.
    expect(quote.dailyCost.slice(0, 7)).toBe("28.9247");

    const rental = await checkout(
      borrower.id,
      shoes.map((s) => s.id),
      { plannedDays: 10 },
    );
    const items = await db.rentalItem.findMany({ where: { rentalId: rental.id } });
    expect((await rentalLocked(rental.id)).toFixed(2)).toBe(quote.required);
    expect(rental.estimatedRent.toFixed(2)).toBe(quote.estimate);
    expect((await walletBalance(borrower.id)).balance.toFixed(2)).toBe("1000000.00");
    for (const shoe of shoes) {
      const s = await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } });
      expect(s.committedWear.toString()).toBe("2.5");
    }
    for (const item of items) await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    for (const item of items) {
      await endRental(borrower.id, item.id, day(10));
      await arrive(await deliveryFor(item.id, "COLLECT"), day(11));
      await recordCondition(
        merchant.id,
        { itemId: item.id, grade: "A", photos: photos() },
        day(11),
      );
    }
    for (const item of await db.rentalItem.findMany({ where: { rentalId: rental.id } })) {
      expect(item.wearEnd!.toString()).toBe("2.5");
    }
  });
});

describe("direct handoff chain (§5.3)", () => {
  it("A → B → C: each term ends on its last day; delivery and waiting days are free", async () => {
    const { merchantId } = await setup();
    const [a, b, c] = await Promise.all([
      makeUser("BORROWER"),
      makeUser("BORROWER"),
      makeUser("BORROWER"),
    ]);
    const shoe = await makeShoe(merchantId);

    const rentalA = await checkout(a.id, [shoe.id], { plannedDays: 30 }, day(-1));
    const itemA = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rentalA.id } });
    await arrive(await deliveryFor(itemA.id, "DELIVER"), day(0));

    // B reserves the pair on A's day 2.
    const rentalB = await checkout(b.id, [shoe.id], { plannedDays: 20 }, day(2));
    const itemB = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rentalB.id } });
    expect(itemB.status).toBe("WAITING_HANDOFF");
    expect(dateToDay(itemB.plannedFirstDay!)).toBe(colomboDay(day(32)));
    await expect(checkout(c.id, [shoe.id], { plannedDays: 5 }, day(3))).rejects.toThrow(
      /reserved next/,
    );

    // B's rent was priced from the wear A's term commits: 30.
    expect(itemB.plannedWearStart!.toString()).toBe("30");
    await endRental(a.id, itemA.id, day(30)); // A's term: days 1–30
    const handoffAB = await deliveryFor(itemB.id, "HANDOFF");
    expect(handoffAB.paidBy).toBe("BORROWER"); // B, receiving it, pays the driver
    expect(handoffAB.fromRentalItemId).toBe(itemA.id);
    // From A's account address to B's.
    expect(handoffAB.fromAddress).toBe(fullAddress(a));
    expect(handoffAB.toAddress).toBe(fullAddress(b));
    await arrive(handoffAB, day(31)); // the handoff day is nobody's
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

    const rentalC = await checkout(c.id, [shoe.id], { plannedDays: 5 }, day(40));
    const itemC = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rentalC.id } });
    // B's 20-day term is days 32–51; the handoff to C is on day 51, so C starts on day 52.
    await endRental(b.id, itemB.id, day(51));
    await arrive(await deliveryFor(itemC.id, "HANDOFF"), day(51));
    await recordCondition(c.id, { itemId: itemC.id, grade: "B", photos: photos() }, day(51));

    const [A, B, C] = await Promise.all(
      [itemA, itemB, itemC].map((i) => db.rentalItem.findUniqueOrThrow({ where: { id: i.id } })),
    );
    expect(A.endDate!.getTime()).toBe(B.startDate!.getTime());
    expect(B.endDate!.getTime()).toBe(C.startDate!.getTime());
    // Ledger days: A 1–30, nobody 31, B 32–51, C from 52.
    expect(dateToDay(A.lastDay!)).toBe(colomboDay(day(30)));
    expect(dateToDay(B.firstDay!)).toBe(colomboDay(day(32)));
    expect(dateToDay(B.lastDay!)).toBe(colomboDay(day(51)));
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
  it("has no cap on pairs held at once, and rejects unavailable pairs", async () => {
    const { merchantId, borrower } = await setup();
    const shoes = await Promise.all([1, 2, 3, 4, 5].map(() => makeShoe(merchantId)));
    await checkout(
      borrower.id,
      shoes.slice(0, 3).map((s) => s.id),
      { plannedDays: 7 },
    );
    // Five pairs at once is fine: wear is split 1/n across them.
    await checkout(
      borrower.id,
      shoes.slice(3).map((s) => s.id),
      { plannedDays: 7 },
    );
    expect(await db.rentalItem.count({ where: { rental: { borrowerId: borrower.id } } })).toBe(5);

    const other = await makeUser("BORROWER");
    await expect(checkout(other.id, [shoes[0].id], { plannedDays: 7 })).rejects.toThrow(
      BookingError,
    );
  });

  it("a damage flag opens a dispute on the closed item", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);
    const rental = await checkout(borrower.id, [shoe.id], {
      plannedDays: 7,
    });
    const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    await endRental(borrower.id, item.id, day(7));
    await arrive(await deliveryFor(item.id, "COLLECT"), day(8));
    await recordCondition(
      merchant.id,
      { itemId: item.id, grade: "C", photos: photos(), damageFlag: true, notes: "Torn heel" },
      day(8),
    );
    const dispute = await db.dispute.findFirstOrThrow({ where: { rentalItemId: item.id } });
    expect(dispute.status).toBe("OPEN");
    expect(dispute.reason).toMatch(/Torn heel/);
  });

  it("a pair booked to the end of its life can't be reserved next, and is retired after", async () => {
    const { merchant, merchantId } = await setup();
    const [a, b] = await Promise.all([makeUser("BORROWER"), makeUser("BORROWER")]);
    const shoe = await makeShoe(merchantId, { lifespanDays: 60 });
    const rentalA = await checkout(a.id, [shoe.id], { plannedDays: 70 }, day(-1));
    const itemA = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rentalA.id } });
    await arrive(await deliveryFor(itemA.id, "DELIVER"), day(0));
    // A's term commits the whole life and 10 days past it, so nobody can reserve it next.
    expect(
      (await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).committedWear.toString(),
    ).toBe("70");
    await expect(checkout(b.id, [shoe.id], { plannedDays: 5 }, day(65))).rejects.toThrow(
      /end of life/,
    );

    // The daily job ends the term on day 71 (the day after its last day) and books the driver.
    await runDailyRentals(day(71));
    expect(
      dateToDay((await db.rentalItem.findUniqueOrThrow({ where: { id: itemA.id } })).lastDay!),
    ).toBe(colomboDay(day(70)));
    await arrive(await deliveryFor(itemA.id, "COLLECT"), day(71));
    await recordCondition(merchant.id, { itemId: itemA.id, grade: "C", photos: photos() }, day(71));

    const closed = await db.rentalItem.findUniqueOrThrow({ where: { id: itemA.id } });
    expect(closed.wearEnd!.toString()).toBe("70"); // 10 wear-days past L
    // The whole of R, plus 10 days at the end-of-life price P(L).
    const p60 = curveParams(6000, 60, DEFAULT_PRICING_SETTINGS);
    expect(closed.charge!.toFixed(2)).toBe(
      priceAt(p60, 60).times(10).plus(7200).toDecimalPlaces(2).toFixed(2),
    );
    // Merchant first: the merchant gets their 6,600; everything past it is the platform's.
    expect(closed.merchantShare!.toFixed(2)).toBe("6600.00");
    await markCleaned(merchantId, shoe.id);
    expect((await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).status).toBe("RETIRED");
  });

  it("only the right people can record condition", async () => {
    const { merchantId, borrower } = await setup();
    const stranger = await makeUser("BORROWER");
    const otherMerchant = await makeUser("MERCHANT");
    const shoe = await makeShoe(merchantId);
    const rental = await checkout(borrower.id, [shoe.id], {
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
  it("a one-day term is the day after delivery; ending on the delivery day costs nothing", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const [shoe, other] = await Promise.all([makeShoe(merchantId), makeShoe(merchantId)]);
    const rental = await checkout(borrower.id, [shoe.id], {
      plannedDays: 1,
    });
    const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
    expect(rental.estimatedRent.toFixed(2)).toBe("28.92"); // ≈ K for one new wear-day
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    await endRental(borrower.id, item.id, day(1));
    await arrive(await deliveryFor(item.id, "COLLECT"), day(2));
    await recordCondition(merchant.id, { itemId: item.id, grade: "A", photos: photos() }, day(2));
    const closed = await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(closed.wearEnd!.toString()).toBe("1");
    expect(closed.charge!.toFixed(2)).toBe("28.92");

    // Wrong size, sent back the day it came: no wear, nothing charged.
    const before = (await walletBalance(borrower.id)).balance;
    const r2 = await checkout(borrower.id, [other.id], {
      plannedDays: 30,
    });
    const item2 = await db.rentalItem.findFirstOrThrow({ where: { rentalId: r2.id } });
    await arrive(await deliveryFor(item2.id, "DELIVER"), day(5));
    await endRental(borrower.id, item2.id, day(5));
    expect(
      (await db.shoe.findUniqueOrThrow({ where: { id: other.id } })).committedWear.toString(),
    ).toBe("0");
    await arrive(await deliveryFor(item2.id, "COLLECT"), day(6));
    await recordCondition(merchant.id, { itemId: item2.id, grade: "A", photos: photos() }, day(6));
    const closed2 = await db.rentalItem.findUniqueOrThrow({ where: { id: item2.id } });
    expect(closed2.charge!.toFixed(2)).toBe("0.00");
    expect((await walletBalance(borrower.id)).balance.toFixed(2)).toBe(before.toFixed(2));
  });

  it("worked example through booking: A 216.89 + B (second-hand, wear 50 → 52.5) 95.81", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const a = await makeShoe(merchantId);
    const b = await makeShoe(merchantId, { value: "8000", initialWear: "50" });
    // Worked example: A days 1–10, B days 6–10, one borrower.
    const r1 = await checkout(borrower.id, [a.id], { plannedDays: 10 }, day(-1));
    const itemA = await db.rentalItem.findFirstOrThrow({ where: { rentalId: r1.id } });
    await arrive(await deliveryFor(itemA.id, "DELIVER"), day(0));
    const r2 = await checkout(borrower.id, [b.id], { plannedDays: 5 }, day(4));
    const itemB = await db.rentalItem.findFirstOrThrow({ where: { rentalId: r2.id } });
    // Planned from tomorrow (day 5): B overlaps A on days 5–9, so A's plan drops to 7.5.
    expect(
      (
        await db.rentalItem.findUniqueOrThrow({ where: { id: itemA.id } })
      ).plannedWearEnd!.toString(),
    ).toBe("7.5");
    await arrive(await deliveryFor(itemB.id, "DELIVER"), day(5));
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
    // The rent charged at close is the final charge; A's estimate dropped when B's overlap
    // was planned, and both locks are released.
    expect([A.rentPaid, B.rentPaid].map((x) => x.toFixed(2))).toEqual(["216.89", "95.81"]);
    expect([A.rentLocked, B.rentLocked].map((x) => x.toFixed(2))).toEqual(["0.00", "0.00"]);
  });

  it("the estimate counts pairs already held: a second pair for 10 days gains 5 wear-days", async () => {
    const { merchantId, borrower } = await setup();
    const [held, next] = await Promise.all([makeShoe(merchantId), makeShoe(merchantId)]);
    await checkout(borrower.id, [held.id], { plannedDays: 10 });
    const alone = await quoteBundle(null, [next.id], 5);
    const shared = await quoteBundle(borrower.id, [next.id], 10);
    // 5 days alone and 10 days shared with one other pair both add 5 wear-days.
    expect(shared.estimate).toBe(alone.estimate);
    expect(shared.totalPairs).toBe(2);
  });

  it("a 90-day term on a new pair shows 90/365 used from booking, and frees it after day 90", async () => {
    const { merchantId, borrower } = await setup();
    const other = await makeUser("BORROWER");
    const shoe = await makeShoe(merchantId);
    await checkout(borrower.id, [shoe.id], { plannedDays: 90 }, day(-1));
    const booked = await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } });
    expect(booked.committedWear.toString()).toBe("90");
    const item = await db.rentalItem.findFirstOrThrow({ where: { shoeId: shoe.id } });
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    const held = await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } });
    expect(dateToDay(held.releaseDay!)).toBe(colomboDay(day(90)));
    // The next borrower is priced from wear 90, the wear the pair will have when it's free.
    const q = await quoteBundle(other.id, [shoe.id], 10, undefined, day(85));
    expect(q.lines[0].wear).toBe("90");
    expect(dateToDay(q.lines[0].firstDay)).toBe(colomboDay(day(92)));
    // The term runs out: the daily job ends it on day 91 with day 90 as the last day.
    await runDailyRentals(day(90));
    expect((await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe(
      "ACTIVE",
    );
    await runDailyRentals(day(91));
    const ended = await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(ended.status).toBe("RETURNING");
    expect(dateToDay(ended.lastDay!)).toBe(colomboDay(day(90)));
    expect(await db.delivery.count({ where: { rentalItemId: item.id, type: "COLLECT" } })).toBe(1);
    expect(
      await db.notification.count({ where: { userId: borrower.id, kind: "TERM_ENDED" } }),
    ).toBe(1);
  });
});

describe("merchant first and free waiting days", () => {
  it("days between ending a rental and the driver collecting are free and add no wear", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);
    const rental = await checkout(borrower.id, [shoe.id], {
      plannedDays: 10,
    });
    const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    await endRental(borrower.id, item.id, day(10));
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
      [0, 40],
      [50, 70],
    ]) {
      const b = await makeUser("BORROWER");
      const rental = await checkout(b.id, [shoe.id], { plannedDays: end - start }, day(start - 1));
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
      // Back in stock with no release discount: this test is about the split.
      await db.shoe.update({
        where: { id: shoe.id },
        data: { status: "AVAILABLE", releaseDay: null },
      });
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
  it("a held pair can be reserved from day 1; the discount starts on day 81 at 0.5% and the next borrower keeps the rate", async () => {
    const { merchant, merchantId } = await setup();
    const [a, b] = await Promise.all([makeUser("BORROWER"), makeUser("BORROWER")]);
    const shoe = await makeShoe(merchantId);
    // A books 90 days and gets the pair on day 0: days 1–90, release day 90.
    const rentalA = await checkout(a.id, [shoe.id], { plannedDays: 90 }, day(0));
    const itemA = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rentalA.id } });
    expect(itemA.plannedDays).toBe(90);
    await arrive(await deliveryFor(itemA.id, "DELIVER"), day(0));
    const held = await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } });
    expect(dateToDay(held.releaseDay!)).toBe(colomboDay(day(90)));

    // Shown and reservable from A's day 1, priced at the wear it will have after A's term;
    // the release discount starts on A's 81st day at 0.5%, rising 0.5% a day.
    expect((await browseShoes({})).map((s) => s.id)).toContain(shoe.id);
    const early = await quoteBundle(b.id, [shoe.id], 10, undefined, day(1));
    expect(early.problems).toEqual([]);
    expect([early.lines[0].wear, early.lines[0].discount]).toEqual(["90", "0"]);
    expect(dateToDay(early.lines[0].firstDay)).toBe(colomboDay(day(92)));
    const discountOn = async (d: number) =>
      (await quoteBundle(null, [shoe.id], 10, undefined, day(d))).lines[0].discount;
    expect(await discountOn(80)).toBe("0");
    expect(await discountOn(81)).toBe("0.005");
    expect(await discountOn(90)).toBe("0.05"); // release day
    expect(await discountOn(100)).toBe("0.1");
    expect(await discountOn(200)).toBe("0.1"); // steady at the maximum

    // B reserves on day 85 (2.5% off) and keeps that rate for the whole rental.
    const rentalB = await checkout(b.id, [shoe.id], { plannedDays: 10 }, day(85));
    const itemB = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rentalB.id } });
    expect(itemB.discount.toString()).toBe("0.025");
    expect(itemB.discountFunding).toBe("PLATFORM");
    // Reserved: nobody else sees it in the catalogue.
    expect((await browseShoes({})).map((s) => s.id)).not.toContain(shoe.id);

    await endRental(a.id, itemA.id, day(90));
    await arrive(await deliveryFor(itemB.id, "HANDOFF"), day(91));
    await recordCondition(b.id, { itemId: itemB.id, grade: "A", photos: photos() }, day(91));
    await endRental(b.id, itemB.id, day(101));
    await arrive(await deliveryFor(itemB.id, "COLLECT"), day(102));
    await recordCondition(
      merchant.id,
      { itemId: itemB.id, grade: "A", photos: photos() },
      day(102),
    );

    const B = await db.rentalItem.findUniqueOrThrow({ where: { id: itemB.id } });
    expect([B.wearStart!.toString(), B.wearEnd!.toString()]).toEqual(["90", "100"]);
    const p = curveParams(6000, 365, DEFAULT_PRICING_SETTINGS);
    const expected = incomeBetween(p, 90, 100, "0.025");
    expect(B.chargeExact!.toString().slice(0, 12)).toBe(expected.income.toString().slice(0, 12));
    expect(B.discountCost!.toString().slice(0, 10)).toBe(
      expected.discountCost.toString().slice(0, 10),
    );
    // B's estimate was exactly this; it was charged at close and the lock released.
    expect(B.rentPaid.toFixed(2)).toBe(B.charge!.toFixed(2));
    expect(B.rentLocked.toFixed(2)).toBe("0.00");
    // B's own 10-day term (days 92–101) sets the next release day.
    const after = await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } });
    expect(dateToDay(after.releaseDay!)).toBe(colomboDay(day(101)));
  });

  it("a pair returned early counts its release discount from the day it was ended; a new pair has none", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const [shoe, fresh] = await Promise.all([makeShoe(merchantId), makeShoe(merchantId)]);
    const rental = await checkout(borrower.id, [shoe.id], { plannedDays: 30 }, day(0));
    const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    // Notice on day 10 for a last day of 20 (of 30); the daily job ends it on day 21.
    await scheduleEarlyReturn(borrower.id, item.id, isoDay(20), day(10));
    await runDailyRentals(day(21));
    await arrive(await deliveryFor(item.id, "COLLECT"), day(21));
    await recordCondition(merchant.id, { itemId: item.id, grade: "A", photos: photos() }, day(21));
    await markCleaned(merchantId, shoe.id);
    // Ended on day 20: window opened day 11; on day 25 (15 days in) it is 7.5%.
    const q = await quoteBundle(null, [shoe.id, fresh.id], 5, undefined, day(25));
    expect(q.lines.map((l) => l.discount)).toEqual(["0.075", "0"]);
    expect(new D(q.lines[0].priceToday).lt(q.lines[0].priceBeforeDiscount)).toBe(true);
  });
});
