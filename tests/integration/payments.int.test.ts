import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D } from "@/lib/decimal";
import { db } from "@/server/db";
import { BookingError, checkout, quoteBundle } from "@/server/booking/checkout";
import { endRental, extendRental, recordCondition } from "@/server/booking/lifecycle";
import { finishRentalIfDone, markLost } from "@/server/payments";
import { MockGateway, setGatewayForTests } from "@/server/payments/gateway";
import {
  WalletError,
  pairLocked,
  rentalLocked,
  topUp,
  walletBalance,
  withdraw,
} from "@/server/wallet";
import {
  arrive,
  day,
  deliveryFor,
  fund,
  makeShoe,
  makeUser,
  photos,
  resetDb,
  setup,
} from "./helpers";

beforeEach(resetDb);
afterEach(() => setGatewayForTests(undefined));

const address = { deliveryAddress: "1 Flower Rd" };

async function balances(userId: string) {
  const b = await walletBalance(userId);
  return {
    balance: b.balance.toFixed(2),
    locked: b.locked.toFixed(2),
    available: b.available.toFixed(2),
  };
}

async function rentOne(borrowerId: string, shoeId: string, plannedDays = 30) {
  const rental = await checkout(borrowerId, [shoeId], { ...address, plannedDays });
  const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
  return { rental, item };
}

describe("tokens: top up, pay the rent and lock the value at booking, unlock at return", () => {
  it("books only with value + rent available, pays the rent upfront and unlocks the value", async () => {
    const { merchant, merchantId } = await setup();
    const borrower = await makeUser("BORROWER", { tokens: "0" });
    const shoe = await makeShoe(merchantId);

    // 6,000 LKR pair for 100 days: rent 2,866.11, so 8,866.11 tokens needed.
    const quote = await quoteBundle(borrower.id, [shoe.id], 100);
    expect([quote.shoeValue, quote.estimate, quote.required]).toEqual([
      "6000.00",
      "2866.11",
      "8866.11",
    ]);
    expect(quote.shortfall).toBe("8866.11");
    await expect(
      checkout(borrower.id, [shoe.id], { ...address, plannedDays: 100 }),
    ).rejects.toThrow(/Top up 8866.11 tokens/);

    await topUp(borrower.id, "8866.11", "form-1");
    await topUp(borrower.id, "8866.11", "form-1"); // double submit: charged once
    expect(await db.payment.count({ where: { userId: borrower.id, kind: "TOP_UP" } })).toBe(1);
    expect(await balances(borrower.id)).toEqual({
      balance: "8866.11",
      locked: "0.00",
      available: "8866.11",
    });

    const { rental, item } = await rentOne(borrower.id, shoe.id, 100);
    expect(rental.status).toBe("ACTIVE");
    // Rent 2,866.11 paid; the pair's 6,000 locked as a deposit.
    expect(await balances(borrower.id)).toEqual({
      balance: "6000.00",
      locked: "6000.00",
      available: "0.00",
    });

    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    await endRental(borrower.id, item.id, day(100));
    await arrive(await deliveryFor(item.id, "COLLECT"), day(100));
    await recordCondition(merchant.id, { itemId: item.id, grade: "A", photos: photos() }, day(100));

    // The term was kept: nothing more to pay, and the pair's 6,000 is unlocked.
    expect(await balances(borrower.id)).toEqual({
      balance: "6000.00",
      locked: "0.00",
      available: "6000.00",
    });
    expect((await rentalLocked(rental.id)).toFixed(2)).toBe("0.00");

    // Unused tokens go back to the card that paid for them.
    await expect(withdraw(borrower.id, "6000.01")).rejects.toThrow(/up to 6000.00/);
    await withdraw(borrower.id, "6000");
    const refund = await db.payment.findFirstOrThrow({ where: { kind: "WITHDRAWAL" } });
    expect(refund.amount.toFixed(2)).toBe("6000.00");
    expect(refund.refundOfId).not.toBeNull();
    expect((await balances(borrower.id)).balance).toBe("0.00");
  });

  it("a declined card adds no tokens", async () => {
    const borrower = await makeUser("BORROWER", { tokens: "0" });
    await expect(topUp(borrower.id, "13.13")).rejects.toThrow(WalletError);
    expect((await balances(borrower.id)).balance).toBe("0.00");
    expect(await db.payment.count({ where: { status: "FAILED" } })).toBe(1);
    await expect(topUp(borrower.id, "abc")).rejects.toThrow(/amount/);
  });

  it("locked tokens can't be withdrawn, and a failed refund gives them back", async () => {
    const { merchantId } = await setup();
    const borrower = await makeUser("BORROWER", { tokens: "0" });
    await topUp(borrower.id, "10000");
    await rentOne(borrower.id, (await makeShoe(merchantId)).id, 10);
    const { available } = await walletBalance(borrower.id);
    await expect(withdraw(borrower.id, "10000")).rejects.toThrow(/up to/);

    const mock = new MockGateway();
    setGatewayForTests({
      name: "mock",
      charge: (amount, key) => mock.charge(amount, key),
      refund: async () => ({ ok: false as const, error: "Refund declined" }),
    });
    await expect(withdraw(borrower.id, available.toFixed(2))).rejects.toThrow(
      /could not be refunded/,
    );
    expect((await walletBalance(borrower.id)).available.toFixed(2)).toBe(available.toFixed(2));
  });

  it("keeps the pair's value locked while a dispute is open", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const shoe = await makeShoe(merchantId);
    const { rental, item } = await rentOne(borrower.id, shoe.id, 10);
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    await endRental(borrower.id, item.id, day(10));
    await arrive(await deliveryFor(item.id, "COLLECT"), day(11));
    await recordCondition(
      merchant.id,
      { itemId: item.id, grade: "C", photos: photos(), damageFlag: true },
      day(11),
    );
    expect((await pairLocked(item.id)).toFixed(2)).toBe("6000.00");

    await db.dispute.updateMany({ where: { rentalItemId: item.id }, data: { status: "REJECTED" } });
    expect(await finishRentalIfDone(rental.id)).toBe(true);
    expect((await rentalLocked(rental.id)).toFixed(2)).toBe("0.00");
  });
});

describe("deposits: each pair's full value stays locked while it is out (pricing-spec.md §6)", () => {
  it("deposits stay whole through delivery and a lost pair; only free tokens can be withdrawn", async () => {
    const { merchantId } = await setup();
    const borrower = await makeUser("BORROWER", { tokens: "0" });
    const [a, b] = await Promise.all([makeShoe(merchantId), makeShoe(merchantId)]);
    const quote = await quoteBundle(borrower.id, [a.id, b.id], 30);
    await fund(borrower.id, new D(quote.required).plus(1000).toFixed(2));
    const rental = await checkout(borrower.id, [a.id, b.id], { ...address, plannedDays: 30 });
    const items = await db.rentalItem.findMany({ where: { rentalId: rental.id } });
    for (const i of items) expect((await pairLocked(i.id)).toFixed(2)).toBe("6000.00");
    expect(await balances(borrower.id)).toEqual({
      balance: "13000.00",
      locked: "12000.00",
      available: "1000.00",
    });

    // A delivered trip costs nothing in tokens: the borrower pays the driver directly.
    const delivery = await deliveryFor(items[0].id, "DELIVER");
    await db.delivery.update({ where: { id: delivery.id }, data: { quote: "450" } });
    await arrive(delivery, day(0));
    for (const i of items) expect((await pairLocked(i.id)).toFixed(2)).toBe("6000.00");
    expect((await balances(borrower.id)).available).toBe("1000.00");
    await expect(withdraw(borrower.id, "1000.01")).rejects.toThrow(/up to 1000.00/);

    // Losing one pair charges its own deposit (then free tokens); the other's stays whole.
    await arrive(await deliveryFor(items[1].id, "DELIVER"), day(0));
    await markLost(items[0].id, day(5));
    expect((await pairLocked(items[1].id)).toFixed(2)).toBe("6000.00");
    expect((await rentalLocked(rental.id)).toFixed(2)).toBe("6000.00");
  });
});

describe("lost pair (§4 rule 3)", () => {
  it("charges R − F(w) from the locked tokens, then the free balance; merchant made whole", async () => {
    const { merchantId } = await setup();
    const borrower = await makeUser("BORROWER", { tokens: "0" });
    const shoe = await makeShoe(merchantId);
    const quote = await quoteBundle(borrower.id, [shoe.id], 30);
    await fund(borrower.id, quote.required); // exactly 6,000 + rent
    const { item } = await rentOne(borrower.id, shoe.id);
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));

    const lost = await markLost(item.id, day(20));
    expect(lost.status).toBe("LOST");
    expect(lost.charge!.toFixed(2)).toBe("7200.00"); // new shoe: the whole of R
    expect(lost.merchantShare!.toFixed(2)).toBe("6600.00");
    expect(lost.platformShare!.toFixed(2)).toBe("600.00");

    // The prepaid rent is refunded; 7,200 is more than was locked: the rest is a debt.
    const b = await balances(borrower.id);
    expect(b.locked).toBe("0.00");
    expect(b.balance).toBe(new D(quote.required).minus(7200).toFixed(2));
    expect((await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).status).toBe("RETIRED");
    expect((await db.user.findUniqueOrThrow({ where: { id: borrower.id } })).locked).toBe(true);
    await expect(
      checkout(borrower.id, [(await makeShoe(merchantId)).id], { ...address, plannedDays: 1 }),
    ).rejects.toThrow(/locked/);
  });

  it("a worn pair costs less to lose", async () => {
    const { merchant, merchantId, borrower } = await setup();
    const other = await makeUser("BORROWER");
    const shoe = await makeShoe(merchantId);
    const first = await rentOne(other.id, shoe.id, 100);
    await arrive(await deliveryFor(first.item.id, "DELIVER"), day(0));
    await endRental(other.id, first.item.id, day(100));
    await arrive(await deliveryFor(first.item.id, "COLLECT"), day(100));
    await recordCondition(
      merchant.id,
      { itemId: first.item.id, grade: "B", photos: photos() },
      day(100),
    );
    await db.shoe.update({ where: { id: shoe.id }, data: { status: "AVAILABLE" } });

    const { item } = await rentOne(borrower.id, shoe.id);
    await arrive(await deliveryFor(item.id, "DELIVER"), day(101));
    const lost = await markLost(item.id, day(110));
    // R − F(100) = 7,200 − 2,866.11. Merchant first: the merchant has had 2,866.11 of their
    // 6,600, so they get the remaining 3,733.89 and the platform its 600.
    expect(lost.charge!.toFixed(2)).toBe("4333.89");
    expect(lost.merchantShare!.toFixed(2)).toBe("3733.89");
    expect(lost.platformShare!.toFixed(2)).toBe("600.00");
  });
});

describe("short balances", () => {
  it("an extension is paid upfront, and refused with nothing changed if tokens are short", async () => {
    const { merchantId } = await setup();
    const borrower = await makeUser("BORROWER", { tokens: "0" });
    const shoe = await makeShoe(merchantId);
    const quote = await quoteBundle(borrower.id, [shoe.id], 10);
    await fund(borrower.id, quote.required);
    const { item } = await rentOne(borrower.id, shoe.id, 10);
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    await expect(extendRental(borrower.id, item.id, 5, day(5))).rejects.toThrow(/Top up/);
    const same = await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(same.plannedDays).toBe(10);
    expect(same.rentPaid.toFixed(2)).toBe(quote.estimate);

    await fund(borrower.id, "500");
    await extendRental(borrower.id, item.id, 5, day(5));
    const extended = await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(extended.plannedDays).toBe(15);
    expect(new D(extended.rentPaid.toString()).gt(quote.estimate)).toBe(true);
    expect((await balances(borrower.id)).available).toBe(
      new D(500).minus(extended.rentPaid.minus(quote.estimate).toString()).toFixed(2),
    );
  });

  it("checkout refuses a short balance and books nothing", async () => {
    const { merchantId } = await setup();
    const borrower = await makeUser("BORROWER", { tokens: "100" });
    await expect(
      checkout(borrower.id, [(await makeShoe(merchantId)).id], { ...address, plannedDays: 5 }),
    ).rejects.toThrow(BookingError);
    expect(await db.rental.count()).toBe(0);
    expect((await db.shoe.findFirstOrThrow()).status).toBe("AVAILABLE");
  });
});
