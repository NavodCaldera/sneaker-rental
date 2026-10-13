import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { checkout, quoteBundle } from "@/server/booking/checkout";
import { endRental, recordCondition } from "@/server/booking/lifecycle";
import { D, roundMoney } from "@/lib/decimal";
import { DEFAULT_PRICING_SETTINGS, curveParams, incomeBetween } from "@/lib/pricing";
import { walletBalance } from "@/server/wallet";
import { arrive, day, deliveryFor, makeShoe, photos, resetDb, setup } from "./helpers";

beforeEach(resetDb);

const p = curveParams(new D(6000), 365, DEFAULT_PRICING_SETTINGS);
const rent = (a: number, b: number) => incomeBetween(p, a, b).income;

async function closeAt(merchantId: string, borrowerId: string, itemId: string, last: number) {
  await endRental(borrowerId, itemId, day(last));
  await arrive(await deliveryFor(itemId, "COLLECT"), day(last + 1));
  await recordCondition(merchantId, { itemId, grade: "A", photos: photos() }, day(last + 1));
  return db.rentalItem.findUniqueOrThrow({ where: { id: itemId } });
}

describe("birthday month: no rent for up to 4 pairs (pricing-spec.md §8a)", () => {
  it("a 100-day term over a February birthday pays for January, March and April only", async () => {
    const { merchant, merchantId, borrower } = await setup();
    await db.user.update({
      where: { id: borrower.id },
      data: { dateOfBirth: new Date("1990-02-14T00:00:00Z") },
    });
    const shoe = await makeShoe(merchantId);

    // Days 1–100 are 2 January – 11 April 2026; February (days 31–58) is free.
    const expected = rent(0, 100).minus(rent(30, 58));
    const quote = await quoteBundle(borrower.id, [shoe.id], 100, undefined, day(-1));
    // Quoted on 31 December, day 1 is planned for 1 January, so February is wear 31–59.
    expect(quote.lines[0].birthdayFree).toBe(roundMoney(rent(31, 59)).toFixed(2));

    const rental = await checkout(borrower.id, [shoe.id], { plannedDays: 100 }, day(-1));
    const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    const planned = await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(planned.plannedCharge!.toFixed(2)).toBe(roundMoney(expected).toFixed(2));
    expect(planned.plannedBirthdayFree!.toFixed(2)).toBe(roundMoney(rent(30, 58)).toFixed(2));

    const closed = await closeAt(merchant.id, borrower.id, item.id, 100);
    // The wear still counts in full; only the rent for February's wear is waived.
    expect(closed.wearEnd!.toString()).toBe("100");
    expect(closed.charge!.toFixed(2)).toBe(roundMoney(expected).toFixed(2));
    expect(new D(closed.birthdayFree!.toString()).toFixed(6)).toBe(rent(30, 58).toFixed(6));
    // Platform-funded: the merchant is still owed their whole target, paid first.
    expect(closed.merchantShare!.toFixed(2)).toBe(closed.charge!.toFixed(2));
    const after = await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } });
    expect(new D(after.lostToDiscounts.toString()).toFixed(6)).toBe(rent(30, 58).toFixed(6));
    expect((await walletBalance(borrower.id)).balance.toFixed(2)).toBe(
      new D(1_000_000).minus(closed.charge!.toString()).toFixed(2),
    );
  });

  it("frees the first 4 pairs held; a fifth pays", async () => {
    const { merchant, merchantId, borrower } = await setup();
    // Born in January: the whole 10-day term (2–11 January) is in the birthday month.
    await db.user.update({
      where: { id: borrower.id },
      data: { dateOfBirth: new Date("2001-01-20T00:00:00Z") },
    });
    const shoes = await Promise.all([1, 2, 3, 4, 5].map(() => makeShoe(merchantId)));
    const rental = await checkout(
      borrower.id,
      shoes.map((s) => s.id),
      { plannedDays: 10 },
      day(-1),
    );
    const items = await db.rentalItem.findMany({ where: { rentalId: rental.id } });
    for (const item of items) await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    const charges = [];
    for (const item of items) charges.push(await closeAt(merchant.id, borrower.id, item.id, 10));

    // Ties on the first day go by item id: the last id is the fifth pair.
    const sorted = charges.sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(sorted.slice(0, 4).map((c) => c.charge!.toFixed(2))).toEqual([
      "0.00",
      "0.00",
      "0.00",
      "0.00",
    ]);
    // Each pair gains 10 × 1/5 = 2 wear-days; the fifth pays for its 2.
    expect(sorted[4].charge!.toFixed(2)).toBe(roundMoney(rent(0, 2)).toFixed(2));
    expect(sorted[4].birthdayFree!.toString()).toBe("0");
  });

  it("is off with no date of birth or 0 free pairs", async () => {
    const { merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);
    const quote = await quoteBundle(borrower.id, [shoe.id], 30);
    expect(quote.lines[0].birthdayFree).toBe("0.00");
    expect(quote.estimate).toBe(roundMoney(rent(0, 30)).toFixed(2));
  });
});
