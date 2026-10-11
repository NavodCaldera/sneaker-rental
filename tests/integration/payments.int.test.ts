import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D } from "@/lib/decimal";
import { db } from "@/server/db";
import { BookingError, checkout, quoteBundle } from "@/server/booking/checkout";
import { endRental, recordCondition } from "@/server/booking/lifecycle";
import { finishRentalIfDone, markLost } from "@/server/payments";
import { MockGateway, setGatewayForTests } from "@/server/payments/gateway";
import { WalletError, rentalLocked, topUp, walletBalance, withdraw } from "@/server/wallet";
import { checkWalletCover } from "@/server/wallet/cover";
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

describe("tokens: top up, lock at booking, charge at return, unlock", () => {
  it("books only with value + rent estimate available, charges the rent and unlocks the rest", async () => {
    const { merchant, merchantId } = await setup();
    const borrower = await makeUser("BORROWER", { tokens: "0" });
    const shoe = await makeShoe(merchantId);

    // 6,000 LKR pair for 100 days: rent estimate 2,866.11, so 8,866.11 tokens needed.
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
    expect(await balances(borrower.id)).toEqual({
      balance: "8866.11",
      locked: "8866.11",
      available: "0.00",
    });

    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    await endRental(borrower.id, item.id, day(99));
    await arrive(await deliveryFor(item.id, "COLLECT"), day(99));
    await recordCondition(merchant.id, { itemId: item.id, grade: "A", photos: photos() }, day(99));

    // Rent 2,866.11 charged; the pair's 6,000 unlocked; nothing left locked.
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
    const { rental, item } = await rentOne(borrower.id, shoe.id);
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    await endRental(borrower.id, item.id, day(9));
    await arrive(await deliveryFor(item.id, "COLLECT"), day(10));
    await recordCondition(
      merchant.id,
      { itemId: item.id, grade: "C", photos: photos(), damageFlag: true },
      day(10),
    );
    expect((await rentalLocked(rental.id)).gte(6000)).toBe(true);

    await db.dispute.updateMany({ where: { rentalItemId: item.id }, data: { status: "REJECTED" } });
    expect(await finishRentalIfDone(rental.id)).toBe(true);
    expect((await rentalLocked(rental.id)).toFixed(2)).toBe("0.00");
  });
});

describe("lost pair (§4 rule 3)", () => {
  it("charges R − F(w) from the locked tokens, then the free balance; merchant made whole", async () => {
    const { merchantId } = await setup();
    const borrower = await makeUser("BORROWER", { tokens: "0" });
    const shoe = await makeShoe(merchantId);
    const quote = await quoteBundle(borrower.id, [shoe.id], 30);
    await fund(borrower.id, quote.required); // exactly 6,000 + rent estimate
    const { item } = await rentOne(borrower.id, shoe.id);
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));

    const lost = await markLost(item.id, day(20));
    expect(lost.status).toBe("LOST");
    expect(lost.charge!.toFixed(2)).toBe("7200.00"); // new shoe: the whole of R
    expect(lost.merchantShare!.toFixed(2)).toBe("6600.00");
    expect(lost.platformShare!.toFixed(2)).toBe("600.00");

    // 7,200 is more than was locked: the rest is a debt (a negative balance).
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
    const first = await rentOne(other.id, shoe.id);
    await arrive(await deliveryFor(first.item.id, "DELIVER"), day(0));
    await endRental(other.id, first.item.id, day(99));
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
    // R − F(100) = 7,200 − 2,866.11. Merchant first: the merchant has had 2,866.11 of their
    // 6,600, so they get the remaining 3,733.89 and the platform its 600.
    expect(lost.charge!.toFixed(2)).toBe("4333.89");
    expect(lost.merchantShare!.toFixed(2)).toBe("3733.89");
    expect(lost.platformShare!.toFixed(2)).toBe("600.00");
  });
});

describe("overrun: locked tokens must keep covering the rental", () => {
  async function tenDayRental(extraTokens = "0") {
    const { merchantId } = await setup();
    const borrower = await makeUser("BORROWER", { tokens: "0" });
    const shoe = await makeShoe(merchantId);
    const quote = await quoteBundle(borrower.id, [shoe.id], 10);
    await fund(borrower.id, quote.required);
    if (extraTokens !== "0") await fund(borrower.id, extraTokens);
    const { rental, item } = await rentOne(borrower.id, shoe.id, 10);
    await arrive(await deliveryFor(item.id, "DELIVER"), day(0));
    return { borrower, rental, item };
  }

  it("asks for a top-up 3 days before the rent outruns the lock, then recalls the pair", async () => {
    const { rental, item } = await tenDayRental();
    // Day 5: rent so far (6 days) plus the next 3 days is within the 10-day estimate.
    expect((await checkWalletCover(day(5)))[0].state).toBe("covered");
    // Day 7: 8 days so far plus 3 ahead is more than the 10 days locked; no free tokens.
    expect((await checkWalletCover(day(7)))[0].state).toBe("top-up requested");
    let r = await db.rental.findUniqueOrThrow({ where: { id: rental.id } });
    expect(r.topUpDueAt!.getTime()).toBe(day(10).getTime());
    expect(r.topUpAmount!.gt(0)).toBe(true);
    expect((await checkWalletCover(day(8)))[0].state).toBe("waiting");

    // No top-up by the deadline: the pair is recalled and charging stops that day.
    expect((await checkWalletCover(day(10)))[0].state).toBe("recalled");
    r = await db.rental.findUniqueOrThrow({ where: { id: rental.id } });
    expect(r.recalledAt).not.toBeNull();
    const recalled = await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(recalled.status).toBe("RETURNING");
    expect(await db.delivery.count({ where: { rentalItemId: item.id, type: "COLLECT" } })).toBe(1);
    expect(await checkWalletCover(day(11))).toEqual([]); // recalled rentals aren't checked again
  });

  it("a top-up clears the request; spare tokens are locked automatically", async () => {
    const { borrower, rental } = await tenDayRental();
    await checkWalletCover(day(7));
    await fund(borrower.id, "1000");
    expect((await checkWalletCover(day(8)))[0].state).toBe("auto-locked");
    const r = await db.rental.findUniqueOrThrow({ where: { id: rental.id } });
    expect(r.topUpDueAt).toBeNull();

    const roomy = await tenDayRental("5000");
    const [result] = await checkWalletCover(day(7), { borrowerId: roomy.borrower.id });
    expect(result.state).toBe("auto-locked");
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
