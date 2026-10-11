import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D } from "@/lib/decimal";
import {
  DEFAULT_PRICING_SETTINGS,
  chargedAmounts,
  curveParams,
  incomeBetween,
  priceAt,
} from "@/lib/pricing";
import { colomboDay, dateToDay } from "@/lib/wear-ledger";
import { checkout } from "@/server/booking/checkout";
import { runDailyRentals } from "@/server/booking/daily";
import { browseShoes } from "@/server/catalogue";
import {
  endRental,
  extendRental,
  recordCondition,
  scheduleEarlyReturn,
} from "@/server/booking/lifecycle";
import { acceptOffer, rejectOffer } from "@/server/booking/reservations";
import { fullAddress } from "@/lib/address";
import { db } from "@/server/db";
import { MockMailer, setMailerForTests } from "@/server/notify/mailer";
import { runPayoutBatch } from "@/server/payouts";
import { rentLockedFor, rentalLocked, walletBalance } from "@/server/wallet";
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
const tokens = async (userId: string) => {
  const b = await walletBalance(userId);
  return { balance: b.balance.toFixed(2), locked: b.locked.toFixed(2) };
};

describe("post-paid rent (pricing-spec.md §6)", () => {
  it("locks the deposit and rent estimate at booking, charges the actual rent at return", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);
    const start = await tokens(borrower.id);
    const rental = await checkout(borrower.id, [shoe.id], { plannedDays: 30 }, day(-1));
    const it1 = await item(rental.id);
    // Nothing charged: V + the estimate are locked, and the wear is committed.
    expect(rental.estimatedRent.toFixed(2)).toBe(rent(0, 30).toFixed(2));
    expect(await tokens(borrower.id)).toEqual({
      balance: start.balance,
      locked: rent(0, 30).plus(6000).toFixed(2),
    });
    expect((await shoeNow(shoe.id)).committedWear.toString()).toBe("30");

    await arrive(await deliveryFor(it1.id, "DELIVER"), day(0));
    await runDailyRentals(day(31));
    await arrive(await deliveryFor(it1.id, "COLLECT"), day(31));
    await recordCondition(merchant.id, { itemId: it1.id, grade: "A", photos: photos() }, day(31));

    const closed = await reload(it1.id);
    expect(closed.charge!.toFixed(2)).toBe(rent(0, 30).toFixed(2));
    expect(closed.rentPaid.toFixed(2)).toBe(closed.charge!.toFixed(2));
    expect(await tokens(borrower.id)).toEqual({
      balance: rent(0, 30).neg().plus(start.balance).toFixed(2),
      locked: "0.00",
    });
    // Merchant first: the whole charge is the merchant's, payable after the dispute window.
    expect(closed.merchantShare!.toFixed(2)).toBe(closed.charge!.toFixed(2));
    const { results } = await runPayoutBatch(day(35));
    expect(results[0].amount).toBe(closed.merchantShare!.toFixed(2));
  });
});

describe("early return (pricing-spec.md §6a)", () => {
  it("needs 10 days' notice; the term then ends on the chosen day and the unused days' estimate is unlocked at once", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);
    const rental = await checkout(borrower.id, [shoe.id], { plannedDays: 90 }, day(-1));
    expect(rental.estimatedRent.toFixed(2)).toBe(rent(0, 90).toFixed(2));
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

    const before = await tokens(borrower.id);
    await scheduleEarlyReturn(borrower.id, it1.id, isoDay(30), day(20));
    const ended = await reload(it1.id);
    expect(ended.status).toBe("ACTIVE"); // still with the borrower until day 30
    expect(ended.earlyReturnAt).not.toBeNull();
    expect(dateToDay(ended.termEndDay!)).toBe(colomboDay(day(30)));
    expect(ended.plannedDays).toBe(30);
    expect(ended.plannedWearEnd!.toString()).toBe("30");
    expect(ended.rentLocked.toFixed(2)).toBe(rent(0, 30).toFixed(2));
    expect((await shoeNow(shoe.id)).committedWear.toString()).toBe("30");
    // Nothing charged or refunded: the estimate for the unused days is unlocked.
    const after = await tokens(borrower.id);
    expect(after.balance).toBe(before.balance);
    expect(new D(before.locked).minus(after.locked).toFixed(2)).toBe(
      rent(0, 90).minus(rent(0, 30)).toFixed(2),
    );
    const unlock = await db.walletEntry.findFirstOrThrow({
      where: { rentalItemId: it1.id, kind: "UNLOCK", purpose: "RENT" },
    });
    expect(unlock.note).toMatch(/Rent estimate down/);

    // The daily job ends the shortened term on day 31 and books the driver.
    await runDailyRentals(day(30));
    expect((await reload(it1.id)).status).toBe("ACTIVE");
    await runDailyRentals(day(31));
    expect(dateToDay((await reload(it1.id)).lastDay!)).toBe(colomboDay(day(30)));
    await arrive(await deliveryFor(it1.id, "COLLECT"), day(31));
    await recordCondition(merchant.id, { itemId: it1.id, grade: "A", photos: photos() }, day(31));
    // Charged for the 30 days held.
    expect((await reload(it1.id)).rentPaid.toFixed(2)).toBe(rent(0, 30).toFixed(2));
    expect((await tokens(borrower.id)).locked).toBe("0.00");
  });

  it("bundle split: two pairs for 90 days gain 45 each; ending A on day 30 → A 15, B 75", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const [a, b] = await Promise.all([makeShoe(merchantId), makeShoe(merchantId)]);
    const rental = await checkout(borrower.id, [a.id, b.id], { plannedDays: 90 }, day(-1));
    const items = await db.rentalItem.findMany({ where: { rentalId: rental.id } });
    const [itemA, itemB] = [a, b].map((s) => items.find((i) => i.shoeId === s.id)!);
    expect((await shoeNow(a.id)).committedWear.toString()).toBe("45");
    expect((await shoeNow(b.id)).committedWear.toString()).toBe("45");
    for (const i of items) await arrive(await deliveryFor(i.id, "DELIVER"), day(0));

    await scheduleEarlyReturn(borrower.id, itemA.id, isoDay(30), day(20));
    const [A, B] = await Promise.all([reload(itemA.id), reload(itemB.id)]);
    expect(A.plannedWearEnd!.toString()).toBe("15");
    expect(B.plannedWearEnd!.toString()).toBe("75");
    expect(A.rentLocked.toFixed(2)).toBe(rent(0, 15).toFixed(2));
    expect(B.rentLocked.toFixed(2)).toBe(rent(0, 75).toFixed(2));
    expect((await rentLockedFor(itemB.id)).toFixed(2)).toBe(rent(0, 75).toFixed(2));
    expect((await shoeNow(b.id)).committedWear.toString()).toBe("75");

    // Each pair is charged at its own close for the wear it actually got.
    await runDailyRentals(day(31));
    await arrive(await deliveryFor(itemA.id, "COLLECT"), day(31));
    await recordCondition(merchant.id, { itemId: itemA.id, grade: "A", photos: photos() }, day(31));
    await endRental(borrower.id, itemB.id, day(90));
    await arrive(await deliveryFor(itemB.id, "COLLECT"), day(91));
    await recordCondition(merchant.id, { itemId: itemB.id, grade: "A", photos: photos() }, day(91));
    const [cA, cB] = await Promise.all([reload(itemA.id), reload(itemB.id)]);
    expect([cA.wearEnd!.toString(), cB.wearEnd!.toString()]).toEqual(["15", "75"]);
    expect(cA.rentPaid.toFixed(2)).toBe(rent(0, 15).toFixed(2));
    expect(cB.rentPaid.toFixed(2)).toBe(rent(0, 75).toFixed(2));
    expect((await rentalLocked(rental.id)).toFixed(2)).toBe("0.00");
  });
});

describe("reserve from day 1; the holder returns early (pricing-spec.md §6a)", () => {
  /**
   * U1 holds a new pair for days 1–90 (delivered day 0). U2 reserves it on U1's day 1 for 30
   * days, priced at the wear it will have after U1's term (90), from day 92, at no discount.
   */
  async function reserved() {
    const ctx = await setup();
    const [u1, u2] = [ctx.borrower, await makeUser("BORROWER")];
    const shoe = await makeShoe(ctx.merchantId);
    const r1 = await checkout(u1.id, [shoe.id], { plannedDays: 90 }, day(-1));
    const item1 = await item(r1.id);
    await arrive(await deliveryFor(item1.id, "DELIVER"), day(0));
    const start2 = await tokens(u2.id);
    const r2 = await checkout(u2.id, [shoe.id], { plannedDays: 30 }, day(1));
    const item2 = await item(r2.id);
    expect(item2.status).toBe("WAITING_HANDOFF");
    expect(item2.discount.toString()).toBe("0");
    expect(dateToDay(item2.plannedFirstDay!)).toBe(colomboDay(day(92)));
    expect(item2.plannedWearStart!.toString()).toBe("90");
    expect(item2.rentLocked.toFixed(2)).toBe(rent(90, 120).toFixed(2));
    // Locked, not charged: U2's balance is untouched.
    expect(await tokens(u2.id)).toEqual({
      balance: start2.balance,
      locked: rent(90, 120).plus(6000).toFixed(2),
    });
    expect((await shoeNow(shoe.id)).committedWear.toString()).toBe("120");
    return { ...ctx, u1, u2, shoe, r1, r2, item1, item2, start2 };
  }

  it("U2 is offered the earlier dates at the new price; accepting moves the plan and the lock, and the pair is handed over after U1's last day", async () => {
    const { merchantId, u1, u2, shoe, item1, item2, start2 } = await reserved();
    // Notice on day 20 for a last day of 30: the pair can reach U2 for day 32, at wear 30.
    await scheduleEarlyReturn(u1.id, item1.id, isoDay(30), day(20));

    const offered = await reload(item2.id);
    expect(dateToDay(offered.offerFirstDay!)).toBe(colomboDay(day(32)));
    expect(offered.offerWearStart!.toString()).toBe("30");
    expect(offered.offerCharge!.toFixed(2)).toBe(rent(30, 60).toFixed(2));
    expect(offered.offerDueAt!.getTime()).toBe(day(20).getTime() + 24 * 3_600_000);
    // Nothing changes until U2 answers.
    expect(dateToDay(offered.plannedFirstDay!)).toBe(colomboDay(day(92)));
    expect(offered.rentLocked.toFixed(2)).toBe(rent(90, 120).toFixed(2));
    // Told in the app and by email: the new dates and the new price.
    const notice = await db.notification.findFirstOrThrow({
      where: { userId: u2.id, kind: "PRICE_OFFER" },
    });
    expect(notice.body).toMatch(/returning the Nike Pegasus 41 early/);
    expect(notice.body).toMatch(/day 1 on/);
    expect(notice.body).toMatch(/30 days used, not 90/);
    expect(notice.body).toMatch(/original dates/);
    expect(notice.emailedAt).not.toBeNull();
    expect(mail.sent.map((m) => m.to)).toContain(
      (await db.user.findUniqueOrThrow({ where: { id: u2.id } })).email,
    );
    // U1's estimate drops to the 30 days they keep it.
    expect((await reload(item1.id)).rentLocked.toFixed(2)).toBe(rent(0, 30).toFixed(2));

    await acceptOffer(u2.id, item2.id, day(21));
    const accepted = await reload(item2.id);
    expect(accepted.offerCharge).toBeNull();
    expect(dateToDay(accepted.plannedFirstDay!)).toBe(colomboDay(day(32)));
    expect(accepted.plannedCharge!.toFixed(2)).toBe(rent(30, 60).toFixed(2));
    expect(accepted.rentLocked.toFixed(2)).toBe(rent(30, 60).toFixed(2));
    expect(await tokens(u2.id)).toEqual({
      balance: start2.balance,
      locked: rent(30, 60).plus(6000).toFixed(2),
    });

    // U1 keeps the pair through day 30; the daily job then books the handoff.
    expect(await db.delivery.count({ where: { fromRentalItemId: item1.id } })).toBe(0);
    await runDailyRentals(day(31));
    const handoff = await deliveryFor(item2.id, "HANDOFF");
    expect(handoff.fromRentalItemId).toBe(item1.id);
    await arrive(handoff, day(31));
    const started = await reload(item2.id);
    expect(dateToDay(started.firstDay!)).toBe(colomboDay(day(32)));
    expect(dateToDay(started.termEndDay!)).toBe(colomboDay(day(61)));

    // U2's receipt closes U1's item: U1 is charged for 30 days and the merchant credited.
    const u1Before = await tokens(u1.id);
    await recordCondition(u2.id, { itemId: item2.id, grade: "A", photos: photos() }, day(31));
    const closed1 = await reload(item1.id);
    expect(closed1.status).toBe("CLOSED");
    expect(closed1.rentPaid.toFixed(2)).toBe(rent(0, 30).toFixed(2));
    expect(await tokens(u1.id)).toEqual({
      balance: rent(0, 30).neg().plus(u1Before.balance).toFixed(2),
      locked: "0.00",
    });
    const { results } = await runPayoutBatch(day(35));
    const merchant = results.find((r) => r.merchantId === merchantId)!;
    expect(merchant.amount).toBe(closed1.merchantShare!.toFixed(2));
    expect((await shoeNow(shoe.id)).committedWear.toString()).toBe("60");
  });

  it("rejecting (or keeping the original dates) cancels U2's reservation, unlocks everything and emails U2; the pair stays with U1, free, until a new borrower books it", async () => {
    const { u1, u2, shoe, r2, item1, item2, start2 } = await reserved();
    const u3 = await makeUser("BORROWER");
    await scheduleEarlyReturn(u1.id, item1.id, isoDay(30), day(20));
    mail.sent.length = 0;

    await rejectOffer(u2.id, item2.id, day(21));
    const cancelled = await reload(item2.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.rentLocked.toFixed(2)).toBe("0.00");
    expect(cancelled.rentPaid.toFixed(2)).toBe("0.00");
    // Never charged; the deposit and the estimate are unlocked.
    expect(await tokens(u2.id)).toEqual({ balance: start2.balance, locked: "0.00" });
    expect((await rentalLocked(r2.id)).toFixed(2)).toBe("0.00");
    expect((await db.rental.findUniqueOrThrow({ where: { id: r2.id } })).status).toBe("CANCELLED");
    expect((await shoeNow(shoe.id)).committedWear.toString()).toBe("30");
    const notice = await db.notification.findFirstOrThrow({
      where: { userId: u2.id, kind: "RESERVATION_CANCELLED" },
    });
    expect(notice.body).toMatch(/coming back early/);
    expect(notice.body).toMatch(/released/);
    expect(notice.emailedAt).not.toBeNull();
    expect(mail.sent.map((m) => m.to)).toContain(
      (await db.user.findUniqueOrThrow({ where: { id: u2.id } })).email,
    );

    // U1's term ends on day 30, but nobody collects it: U1 keeps it, free, for the next booking.
    await runDailyRentals(day(31));
    const waiting = await reload(item1.id);
    expect([waiting.status, waiting.holdForNext]).toEqual(["RETURNING", true]);
    expect(dateToDay(waiting.lastDay!)).toBe(colomboDay(day(30)));
    expect(await db.delivery.count({ where: { rentalItemId: item1.id, type: "COLLECT" } })).toBe(0);
    const told = await db.notification.findFirstOrThrow({
      where: { userId: u1.id, kind: "TERM_ENDED" },
    });
    expect(told.body).toMatch(/keep the pair safe/);
    expect(told.body).toMatch(/aren't charged/);
    expect((await browseShoes({})).map((s) => s.id)).toContain(shoe.id);

    // U3 books it on day 40: priced from the real wear (30), handed over from U1 straight away.
    const r3 = await checkout(u3.id, [shoe.id], { plannedDays: 10 }, day(40));
    const item3 = await item(r3.id);
    expect(item3.plannedWearStart!.toString()).toBe("30");
    const handoff = await deliveryFor(item3.id, "HANDOFF");
    expect([handoff.fromRentalItemId, handoff.fromAddress, handoff.toAddress]).toEqual([
      item1.id,
      fullAddress(u1),
      fullAddress(u3),
    ]);
    await arrive(handoff, day(41));
    await recordCondition(u3.id, { itemId: item3.id, grade: "A", photos: photos() }, day(41));
    // U1 pays for days 1–30 only: the days spent keeping it for U3 are free.
    const closed1 = await reload(item1.id);
    expect([closed1.status, closed1.wearEnd!.toString()]).toEqual(["CLOSED", "30"]);
    expect(closed1.rentPaid.toFixed(2)).toBe(rent(0, 30).toFixed(2));
    expect(dateToDay((await reload(item3.id)).firstDay!)).toBe(colomboDay(day(42)));
  });

  it("a holder who ends at once (wrong size) waits for U2's answer; an offer nobody answers expires and is cancelled; the pair keeps waiting with U1 for the next booking", async () => {
    const { merchantId } = await setup();
    const [u1, u2] = [await makeUser("BORROWER"), await makeUser("BORROWER")];
    const shoe = await makeShoe(merchantId);
    const r1 = await checkout(u1.id, [shoe.id], { plannedDays: 30 }, day(-1));
    const item1 = await item(r1.id);
    await arrive(await deliveryFor(item1.id, "DELIVER"), day(0));
    const hour = 3_600_000;
    const r2 = await checkout(
      u2.id,
      [shoe.id],
      { plannedDays: 10 },
      new Date(day(0).getTime() + 2 * hour),
    );
    const item2 = await item(r2.id);

    // Wrong size: U1 ends within the free-return window. U2 is offered day 2 instead of 32.
    await endRental(u1.id, item1.id, new Date(day(0).getTime() + 3 * hour));
    const offered = await reload(item2.id);
    expect(dateToDay(offered.offerFirstDay!)).toBe(colomboDay(day(2)));
    expect(offered.offerWearStart!.toString()).toBe("0");
    // The pair waits with U1: no handoff, no collection yet.
    expect(await db.delivery.count({ where: { fromRentalItemId: item1.id } })).toBe(0);
    expect(await db.delivery.count({ where: { rentalItemId: item1.id, type: "COLLECT" } })).toBe(0);

    await runDailyRentals(new Date(day(0).getTime() + 26 * hour)); // within 24 hours of the offer
    expect((await reload(item2.id)).status).toBe("WAITING_HANDOFF");
    await runDailyRentals(day(2));
    expect((await reload(item2.id)).status).toBe("CANCELLED");
    const notice = await db.notification.findFirstOrThrow({
      where: { userId: u2.id, kind: "RESERVATION_CANCELLED" },
    });
    expect(notice.body).toMatch(/weren't accepted in time/);
    expect((await tokens(u2.id)).locked).toBe("0.00");
    await expect(acceptOffer(u2.id, item2.id, day(2))).rejects.toThrow(/no new price/);
    // Still no driver: U1 keeps it for the next booking, and is told so.
    expect(await db.delivery.count({ where: { rentalItemId: item1.id, type: "COLLECT" } })).toBe(0);
    expect((await reload(item1.id)).holdForNext).toBe(true);
    const told = await db.notification.findFirstOrThrow({
      where: { userId: u1.id, kind: "TERM_ENDED" },
    });
    expect(told.body).toMatch(/keep it safe/);
    expect((await shoeNow(shoe.id)).status).toBe("WITH_BORROWER");
  });

  it("accepting needs the higher estimate available; otherwise nothing changes", async () => {
    const { u1, item1, item2, u2 } = await reserved();
    // U2 spends everything that isn't locked.
    const { available } = await walletBalance(u2.id);
    await db.walletEntry.create({
      data: {
        userId: u2.id,
        kind: "WITHDRAWAL",
        amount: available.toFixed(2),
        idempotencyKey: `test-spend:${u2.id}`,
      },
    });
    await scheduleEarlyReturn(u1.id, item1.id, isoDay(30), day(20));
    await expect(acceptOffer(u2.id, item2.id, day(20))).rejects.toThrow(/Top up/);
    const same = await reload(item2.id);
    expect(same.offerCharge).not.toBeNull(); // nothing changed
    expect(dateToDay(same.plannedFirstDay!)).toBe(colomboDay(day(92)));
    expect(same.rentLocked.toFixed(2)).toBe(rent(90, 120).toFixed(2));
    expect(await db.delivery.count({ where: { fromRentalItemId: item1.id } })).toBe(0);
  });

  it("a holder ending on their term's last day hands over as planned, with no offer", async () => {
    const { u1, item1, item2 } = await reserved();
    await endRental(u1.id, item1.id, day(90));
    expect((await reload(item2.id)).offerCharge).toBeNull();
    const handoff = await deliveryFor(item2.id, "HANDOFF");
    expect(handoff.fromRentalItemId).toBe(item1.id);
    expect(await db.notification.count({ where: { kind: "PRICE_OFFER" } })).toBe(0);
  });
});

describe("extension", () => {
  it("adds days before the term ends and moves the release day; not once someone has reserved next", async () => {
    const { merchantId, borrower } = await setup();
    const next = await makeUser("BORROWER");
    const shoe = await makeShoe(merchantId);
    const r = await checkout(borrower.id, [shoe.id], { plannedDays: 30 }, day(-1));
    const it1 = await item(r.id);
    await arrive(await deliveryFor(it1.id, "DELIVER"), day(0));

    await extendRental(borrower.id, it1.id, 10, day(15));
    const extended = await reload(it1.id);
    expect(extended.plannedDays).toBe(40);
    expect(dateToDay(extended.termEndDay!)).toBe(colomboDay(day(40)));
    expect(extended.rentLocked.toFixed(2)).toBe(rent(0, 40).toFixed(2));
    expect(extended.rentPaid.toFixed(2)).toBe("0.00");
    expect((await shoeNow(shoe.id)).committedWear.toString()).toBe("40");
    expect(dateToDay((await shoeNow(shoe.id)).releaseDay!)).toBe(colomboDay(day(40)));

    await checkout(next.id, [shoe.id], { plannedDays: 5 }, day(16));
    await expect(extendRental(borrower.id, it1.id, 5, day(17))).rejects.toThrow(/reserved/);
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
  it("a pair with any life left can be booked for any term; days past L cost P(L); then nobody can book it", async () => {
    const { merchantId, borrower } = await setup();
    const next = await makeUser("BORROWER");
    // 364 of 365 wear-days used.
    const shoe = await makeShoe(merchantId, { initialWear: "364" });
    const rental = await checkout(borrower.id, [shoe.id], { plannedDays: 20 }, day(-1));
    const it1 = await item(rental.id);
    // 1 wear-day on the curve, then 19 days at the end-of-life price P(L), past R.
    expect(it1.plannedWearEnd!.toString()).toBe("384");
    const expected = incomeBetween(p, 364, 365).income.plus(priceAt(p, 365).times(19));
    expect(it1.rentLocked.toFixed(2)).toBe(
      chargedAmounts(expected, { merchantOutstanding: 0 }).charge.toFixed(2),
    );
    expect((await shoeNow(shoe.id)).committedWear.toString()).toBe("384");
    await arrive(await deliveryFor(it1.id, "DELIVER"), day(0));
    await expect(checkout(next.id, [shoe.id], { plannedDays: 5 }, day(15))).rejects.toThrow(
      /end of life/,
    );
  });
});
