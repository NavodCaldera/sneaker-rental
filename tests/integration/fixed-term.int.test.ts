import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PRICING_SETTINGS,
  chargedAmounts,
  curveParams,
  incomeBetween,
} from "@/lib/pricing";
import { colomboDay, dateToDay } from "@/lib/wear-ledger";
import { checkout } from "@/server/booking/checkout";
import { runDailyRentals } from "@/server/booking/daily";
import {
  endRental,
  extendRental,
  recordCondition,
  scheduleEarlyReturn,
} from "@/server/booking/lifecycle";
import { acceptOffer, rejectOffer } from "@/server/booking/reservations";
import { db } from "@/server/db";
import { MockMailer, setMailerForTests } from "@/server/notify/mailer";
import { rentalLocked, walletBalance } from "@/server/wallet";
import {
  TEST_SETTINGS,
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

let mail: MockMailer;
beforeEach(async () => {
  await resetDb();
  mail = new MockMailer();
  setMailerForTests(mail);
});
afterEach(() => setMailerForTests(undefined));

const p = curveParams(6000, 365, DEFAULT_PRICING_SETTINGS);
/** Rent for a new 6,000 LKR / 365-day pair from wear w0 to w1, rounded as charged. */
const rent = (w0: number, w1: number, discount = "0") =>
  chargedAmounts(incomeBetween(p, w0, w1, discount).income, { merchantOutstanding: 0 }).charge;

async function item(rentalId: string) {
  return db.rentalItem.findFirstOrThrow({ where: { rentalId } });
}
const reload = (id: string) => db.rentalItem.findUniqueOrThrow({ where: { id } });
const shoeNow = (id: string) => db.shoe.findUniqueOrThrow({ where: { id } });

describe("early return (pricing-spec.md §6a)", () => {
  it("needs 10 days' notice; the term then ends on the chosen day, unused days refunded at once", async () => {
    const { merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);
    const rental = await checkout(
      borrower.id,
      [shoe.id],
      { deliveryAddress: "Home 123", plannedDays: 90 },
      day(-1),
    );
    expect(rental.prepaidRent.toFixed(2)).toBe(rent(0, 90).toFixed(2));
    expect((await shoeNow(shoe.id)).committedWear.toString()).toBe("90");
    const it1 = await item(rental.id);
    await arrive(await deliveryFor(it1.id, "DELIVER"), day(0));

    // Ending now, or with less than 10 days' notice, is refused.
    await expect(endRental(borrower.id, it1.id, day(20))).rejects.toThrow(/10 days' notice/);
    await expect(scheduleEarlyReturn(borrower.id, it1.id, isoDay(29), day(20))).rejects.toThrow(
      /Pick a last day from/,
    );
    await expect(scheduleEarlyReturn(borrower.id, it1.id, isoDay(90), day(20))).rejects.toThrow(
      /Pick a last day from/,
    );

    const before = (await walletBalance(borrower.id)).balance;
    await scheduleEarlyReturn(borrower.id, it1.id, isoDay(30), day(20));
    const ended = await reload(it1.id);
    expect(ended.status).toBe("ACTIVE"); // still with the borrower until day 30
    expect(ended.earlyReturnAt).not.toBeNull();
    expect(dateToDay(ended.termEndDay!)).toBe(colomboDay(day(30)));
    expect(ended.plannedDays).toBe(30);
    expect(ended.plannedWearEnd!.toString()).toBe("30");
    expect(ended.rentPaid.toFixed(2)).toBe(rent(0, 30).toFixed(2));
    expect((await shoeNow(shoe.id)).committedWear.toString()).toBe("30");
    // The refund is a credit of exactly the unused days' rent.
    const after = (await walletBalance(borrower.id)).balance;
    expect(after.minus(before).toFixed(2)).toBe(rent(0, 90).minus(rent(0, 30)).toFixed(2));
    const credit = await db.walletEntry.findFirstOrThrow({
      where: { rentalItemId: it1.id, kind: "CREDIT" },
    });
    expect(credit.note).toMatch(/Rent refund/);
    // The daily job ends the shortened term on day 31 and books the driver.
    await runDailyRentals(day(30));
    expect((await reload(it1.id)).status).toBe("ACTIVE");
    await runDailyRentals(day(31));
    expect(dateToDay((await reload(it1.id)).lastDay!)).toBe(colomboDay(day(30)));
    expect(await db.delivery.count({ where: { rentalItemId: it1.id, type: "COLLECT" } })).toBe(1);
  });

  it("bundle split: two pairs for 90 days gain 45 each; ending A on day 30 → A 15, B 75", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const [a, b] = await Promise.all([makeShoe(merchantId), makeShoe(merchantId)]);
    const rental = await checkout(
      borrower.id,
      [a.id, b.id],
      { deliveryAddress: "Home 123", plannedDays: 90 },
      day(-1),
    );
    const items = await db.rentalItem.findMany({ where: { rentalId: rental.id } });
    const [itemA, itemB] = [a, b].map((s) => items.find((i) => i.shoeId === s.id)!);
    expect((await shoeNow(a.id)).committedWear.toString()).toBe("45");
    expect((await shoeNow(b.id)).committedWear.toString()).toBe("45");
    for (const i of items) await arrive(await deliveryFor(i.id, "DELIVER"), day(0));

    await scheduleEarlyReturn(borrower.id, itemA.id, isoDay(30), day(20));
    const [A, B] = await Promise.all([reload(itemA.id), reload(itemB.id)]);
    expect(A.plannedWearEnd!.toString()).toBe("15");
    expect(B.plannedWearEnd!.toString()).toBe("75");
    expect(A.rentPaid.toFixed(2)).toBe(rent(0, 15).toFixed(2));
    expect(B.rentPaid.toFixed(2)).toBe(rent(0, 75).toFixed(2));
    expect((await shoeNow(b.id)).committedWear.toString()).toBe("75");

    // Closing both settles nothing more: the plan already matched the days held.
    await runDailyRentals(day(31));
    await arrive(await deliveryFor(itemA.id, "COLLECT"), day(31));
    await recordCondition(merchant.id, { itemId: itemA.id, grade: "A", photos: photos() }, day(31));
    await endRental(borrower.id, itemB.id, day(90));
    await arrive(await deliveryFor(itemB.id, "COLLECT"), day(91));
    await recordCondition(merchant.id, { itemId: itemB.id, grade: "A", photos: photos() }, day(91));
    const [cA, cB] = await Promise.all([reload(itemA.id), reload(itemB.id)]);
    expect([cA.wearEnd!.toString(), cB.wearEnd!.toString()]).toEqual(["15", "75"]);
    expect(cA.charge!.toFixed(2)).toBe(cA.rentPaid.toFixed(2));
    expect(cB.charge!.toFixed(2)).toBe(cB.rentPaid.toFixed(2));
    expect((await rentalLocked(rental.id)).toFixed(2)).toBe("0.00");
  });
});

describe("reserved next, holder returns early (pricing-spec.md §6a)", () => {
  /**
   * U1 holds a new pair for days 1–90; U2 reserves it on day 72 for 30 days at 1% off. With
   * the default settings (10 days' notice, a 10-day release window) a reservation can't meet
   * an early return, so these tests open the window 20 days ahead.
   */
  async function reserved() {
    await db.pricingSettings.create({
      data: { ...TEST_SETTINGS, releaseLeadDays: 20, effectiveFrom: new Date("2020-01-02") },
    });
    const ctx = await setup();
    const [u1, u2, u3] = [ctx.borrower, await makeUser("BORROWER"), await makeUser("BORROWER")];
    const shoe = await makeShoe(ctx.merchantId);
    const r1 = await checkout(
      u1.id,
      [shoe.id],
      { deliveryAddress: "U1 street", plannedDays: 90 },
      day(-1),
    );
    const item1 = await item(r1.id);
    await arrive(await deliveryFor(item1.id, "DELIVER"), day(0));
    const r2 = await checkout(
      u2.id,
      [shoe.id],
      { deliveryAddress: "U2 street", plannedDays: 30 },
      day(72),
    );
    const item2 = await item(r2.id);
    expect(item2.discount.toString()).toBe("0.01");
    expect(item2.plannedWearStart!.toString()).toBe("90");
    expect(item2.rentPaid.toFixed(2)).toBe(rent(90, 120, "0.01").toFixed(2));
    expect((await shoeNow(shoe.id)).committedWear.toString()).toBe("120");
    return { ...ctx, u1, u2, u3, shoe, r2, item1, item2 };
  }

  it("U2 is told the pair has less wear and costs more; accepting pays the difference and gets it after U1's last day", async () => {
    const { u1, u2, shoe, item1, item2 } = await reserved();
    // Notice on day 73 for a last day of 85, 5 days early: wear 85, not 90.
    await scheduleEarlyReturn(u1.id, item1.id, isoDay(85), day(73));

    const offered = await reload(item2.id);
    expect(offered.offerWearStart!.toString()).toBe("85");
    expect(offered.offerCharge!.toFixed(2)).toBe(rent(85, 115, "0.01").toFixed(2));
    expect(offered.offerCharge!.gt(offered.plannedCharge!)).toBe(true);
    expect(offered.rentPaid.toFixed(2)).toBe(rent(90, 120, "0.01").toFixed(2)); // not charged yet
    expect(offered.offerDueAt!.getTime()).toBe(day(73).getTime() + 24 * 3_600_000);
    // No driver yet: the pair waits with U1 until U2 decides.
    expect(await db.delivery.count({ where: { fromRentalItemId: item1.id } })).toBe(0);
    expect(await db.delivery.count({ where: { rentalItemId: item1.id } })).toBe(1); // the delivery in
    // Told in the app and by email.
    const notice = await db.notification.findFirstOrThrow({
      where: { userId: u2.id, kind: "PRICE_OFFER" },
    });
    expect(notice.body).toMatch(/ending their rental of the Nike Pegasus 41 early/);
    expect(notice.body).toMatch(/85 wear-days used, not 90/);
    expect(notice.emailedAt).not.toBeNull();
    expect(mail.sent.map((m) => m.to)).toContain(
      (await db.user.findUniqueOrThrow({ where: { id: u2.id } })).email,
    );
    // U1 was refunded the 5 unused days, and the pair's committed wear follows the real days.
    expect((await reload(item1.id)).rentPaid.toFixed(2)).toBe(rent(0, 85).toFixed(2));
    expect((await shoeNow(shoe.id)).committedWear.toString()).toBe("115");

    const before = (await walletBalance(u2.id)).balance;
    await acceptOffer(u2.id, item2.id, day(74));
    const accepted = await reload(item2.id);
    expect(accepted.offerCharge).toBeNull();
    expect(accepted.plannedCharge!.toFixed(2)).toBe(rent(85, 115, "0.01").toFixed(2));
    expect(accepted.rentPaid.toFixed(2)).toBe(rent(85, 115, "0.01").toFixed(2));
    expect(before.minus((await walletBalance(u2.id)).balance).toFixed(2)).toBe(
      rent(85, 115, "0.01")
        .minus(rent(90, 120, "0.01"))
        .toFixed(2),
    );
    // U1 keeps the pair through day 85; the daily job then books the handoff.
    expect(await db.delivery.count({ where: { fromRentalItemId: item1.id } })).toBe(0);
    await runDailyRentals(day(86));
    const handoff = await deliveryFor(item2.id, "HANDOFF");
    expect(handoff.fromRentalItemId).toBe(item1.id);
    await arrive(handoff, day(87));
    const started = await reload(item2.id);
    expect(dateToDay(started.firstDay!)).toBe(colomboDay(day(88)));
    expect(dateToDay(started.termEndDay!)).toBe(colomboDay(day(117)));
  });

  it("rejecting cancels and refunds U2; after U1's last day the pair waits with U1 until another borrower books it", async () => {
    const { u1, u2, u3, shoe, r2, item1, item2 } = await reserved();
    await scheduleEarlyReturn(u1.id, item1.id, isoDay(85), day(73));
    const balanceBefore = (await walletBalance(u2.id)).balance;

    await rejectOffer(u2.id, item2.id, day(74));
    const cancelled = await reload(item2.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.rentPaid.toFixed(2)).toBe("0.00");
    expect((await walletBalance(u2.id)).balance.minus(balanceBefore).toFixed(2)).toBe(
      rent(90, 120, "0.01").toFixed(2),
    );
    expect((await rentalLocked(r2.id)).toFixed(2)).toBe("0.00");
    expect((await db.rental.findUniqueOrThrow({ where: { id: r2.id } })).status).toBe("CANCELLED");
    expect((await shoeNow(shoe.id)).committedWear.toString()).toBe("85");
    // U1's term ends on day 85, but the pair isn't collected: it waits for the next booking.
    await runDailyRentals(day(86));
    expect((await reload(item1.id)).status).toBe("RETURNING");
    expect(await db.delivery.count({ where: { rentalItemId: item1.id, type: "COLLECT" } })).toBe(0);

    // U3 books it: priced from the real wear (85), handed over from U1 straight away.
    const r3 = await checkout(
      u3.id,
      [shoe.id],
      { deliveryAddress: "U3 street", plannedDays: 10 },
      day(88),
    );
    const item3 = await item(r3.id);
    expect(item3.plannedWearStart!.toString()).toBe("85");
    const handoff = await deliveryFor(item3.id, "HANDOFF");
    expect(handoff.fromRentalItemId).toBe(item1.id);
    expect(handoff.fromAddress).toBe("U1 street");
  });

  it("an offer nobody answers expires: the reservation is cancelled and the borrower told", async () => {
    const { u1, u2, item1, item2 } = await reserved();
    await scheduleEarlyReturn(u1.id, item1.id, isoDay(85), day(73));
    expect(mail.sent.some((m) => /new price/.test(m.subject))).toBe(true); // emailed at once
    await runDailyRentals(new Date(day(73).getTime() + 23 * 3_600_000)); // within 24 hours
    expect((await reload(item2.id)).status).toBe("WAITING_HANDOFF");
    await runDailyRentals(day(75));
    expect((await reload(item2.id)).status).toBe("CANCELLED");
    const notice = await db.notification.findFirstOrThrow({
      where: { userId: u2.id, kind: "RESERVATION_CANCELLED" },
    });
    expect(notice.body).toMatch(/wasn't accepted in time/);
    await expect(acceptOffer(u2.id, item2.id, day(75))).rejects.toThrow(/no new price/);
  });

  it("accepting needs the extra tokens available", async () => {
    const { u1, item1, item2, u2 } = await reserved();
    // U2 spends everything but the original price on something else.
    const { available } = await walletBalance(u2.id);
    await db.walletEntry.create({
      data: {
        userId: u2.id,
        kind: "WITHDRAWAL",
        amount: available.toFixed(2),
        idempotencyKey: `test-spend:${u2.id}`,
      },
    });
    await scheduleEarlyReturn(u1.id, item1.id, isoDay(85), day(73));
    await expect(acceptOffer(u2.id, item2.id, day(73))).rejects.toThrow(/Top up/);
    const same = await reload(item2.id);
    expect(same.offerCharge).not.toBeNull(); // nothing changed
    expect(same.rentPaid.toFixed(2)).toBe(rent(90, 120, "0.01").toFixed(2));
    expect(await db.delivery.count({ where: { fromRentalItemId: item1.id } })).toBe(0);
  });
});

describe("extension", () => {
  it("adds days before the term ends and moves the release day; not once someone has reserved next", async () => {
    const { merchantId, borrower } = await setup();
    const next = await makeUser("BORROWER");
    const shoe = await makeShoe(merchantId);
    const r = await checkout(
      borrower.id,
      [shoe.id],
      { deliveryAddress: "Home 123", plannedDays: 30 },
      day(-1),
    );
    const it1 = await item(r.id);
    await arrive(await deliveryFor(it1.id, "DELIVER"), day(0));

    await extendRental(borrower.id, it1.id, 10, day(15));
    const extended = await reload(it1.id);
    expect(extended.plannedDays).toBe(40);
    expect(dateToDay(extended.termEndDay!)).toBe(colomboDay(day(40)));
    expect(extended.rentPaid.toFixed(2)).toBe(rent(0, 40).toFixed(2));
    expect((await shoeNow(shoe.id)).committedWear.toString()).toBe("40");
    expect(dateToDay((await shoeNow(shoe.id)).releaseDay!)).toBe(colomboDay(day(40)));

    await checkout(next.id, [shoe.id], { deliveryAddress: "Next", plannedDays: 5 }, day(35));
    await expect(extendRental(borrower.id, it1.id, 5, day(36))).rejects.toThrow(/reserved/);
    // The term ran out: the daily job hands the pair to the next borrower.
    await runDailyRentals(day(41));
    const ended = await reload(it1.id);
    expect(ended.status).toBe("RETURNING");
    expect(dateToDay(ended.lastDay!)).toBe(colomboDay(day(40)));
    expect(await db.delivery.count({ where: { fromRentalItemId: it1.id, type: "HANDOFF" } })).toBe(
      1,
    );
    await expect(extendRental(borrower.id, it1.id, 5, day(41))).rejects.toThrow(/extended/);
  });
});

describe("lifespan (pricing-spec.md §6)", () => {
  it("a pair with any life left can be booked for any term; once it reaches L nobody can book it", async () => {
    const { merchantId, borrower } = await setup();
    const next = await makeUser("BORROWER");
    // 364 of 365 wear-days used.
    const shoe = await makeShoe(merchantId, { initialWear: "364" });
    const rental = await checkout(
      borrower.id,
      [shoe.id],
      { deliveryAddress: "Home 123", plannedDays: 20 },
      day(-1),
    );
    const it1 = await item(rental.id);
    // Wear and rent stop at L: 1 wear-day charged, the other 19 days are free.
    expect(it1.plannedWearEnd!.toString()).toBe("365");
    expect(it1.rentPaid.toFixed(2)).toBe(
      chargedAmounts(incomeBetween(p, 364, 365).income, { merchantOutstanding: 0 }).charge.toFixed(
        2,
      ),
    );
    expect((await shoeNow(shoe.id)).committedWear.toString()).toBe("365");
    await arrive(await deliveryFor(it1.id, "DELIVER"), day(0));
    await expect(
      checkout(next.id, [shoe.id], { deliveryAddress: "Next", plannedDays: 5 }, day(15)),
    ).rejects.toThrow(/end of life/);
  });
});
