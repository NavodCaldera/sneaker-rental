import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { rentalLocked } from "@/server/wallet";
import { checkout } from "@/server/booking/checkout";
import { endRental, recordCondition } from "@/server/booking/lifecycle";
import { DisputeError, decideDispute, openDispute } from "@/server/disputes";
import { isoWeek, merchantPayouts, runPayoutBatch } from "@/server/payouts";
import { arrive, day, deliveryFor, makeShoe, makeUser, photos, resetDb } from "./helpers";

beforeEach(resetDb);

/**
 * A full term of `heldDays` (the days before `closeDay`), returned and closed by the merchant
 * on day `closeDay`.
 */
async function closedRental(
  ctx: { merchantUserId: string; merchantId: string },
  closeDay: number,
  heldDays = 10,
  damage = false,
) {
  const borrower = await makeUser("BORROWER");
  const shoe = await makeShoe(ctx.merchantId);
  const rental = await checkout(borrower.id, [shoe.id], {
    deliveryAddress: "Home 123",
    plannedDays: heldDays,
  });
  const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
  await arrive(await deliveryFor(item.id, "DELIVER"), day(closeDay - heldDays - 1));
  await endRental(borrower.id, item.id, day(closeDay - 1));
  await arrive(await deliveryFor(item.id, "COLLECT"), day(closeDay));
  await recordCondition(
    ctx.merchantUserId,
    {
      itemId: item.id,
      grade: damage ? "C" : "A",
      photos: photos(),
      damageFlag: damage,
      notes: damage ? "Sole torn" : undefined,
    },
    day(closeDay),
  );
  return {
    borrower,
    rental,
    item: await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } }),
  };
}

async function merchantCtx() {
  const user = await makeUser("MERCHANT");
  return { merchantUserId: user.id, merchantId: user.merchant!.id };
}

describe("weekly payouts (§4 rule 5)", () => {
  it("pays shares past the 3-day window, skips recent and disputed ones, once per week", async () => {
    const ctx = await merchantCtx();
    const now = day(30);
    const old = await closedRental(ctx, 26); // closed 4 days ago
    const recent = await closedRental(ctx, 28); // closed 2 days ago
    const disputed = await closedRental(ctx, 25, 10, true); // damage flagged → open dispute

    const { batchKey, results } = await runPayoutBatch(now);
    expect(batchKey).toBe(isoWeek(now));
    expect(results).toHaveLength(1);
    expect(results[0].items).toBe(1);
    expect(results[0].amount).toBe(old.item.merchantShare!.toFixed(2));

    const paid = await db.payout.findFirstOrThrow({ where: { merchantId: ctx.merchantId } });
    expect(paid.status).toBe("PAID");
    expect(paid.reference).toMatch(/^mock_transfer_/);
    expect((await db.rentalItem.findUniqueOrThrow({ where: { id: old.item.id } })).payoutId).toBe(
      paid.id,
    );
    expect(
      (await db.rentalItem.findUniqueOrThrow({ where: { id: recent.item.id } })).payoutId,
    ).toBeNull();
    expect(
      (await db.rentalItem.findUniqueOrThrow({ where: { id: disputed.item.id } })).payoutId,
    ).toBeNull();

    // Same week again: the merchant waits for next week's batch.
    const again = await runPayoutBatch(day(31)); // Sunday: same ISO week as day 30
    expect(again.results).toHaveLength(1);
    expect(again.results[0].skipped).toBe("already paid this week");

    const waiting = await merchantPayouts(ctx.merchantId, day(30));
    expect(waiting.waiting.find((w) => w.id === recent.item.id)?.state).toBe("window");
    expect(waiting.waiting.find((w) => w.id === disputed.item.id)?.state).toBe("disputed");
  });

  it("merchant + platform shares equal the rent paid to the cent", async () => {
    const ctx = await merchantCtx();
    for (const d of [10, 11, 12]) await closedRental(ctx, d, 7 + d);
    const items = await db.rentalItem.findMany({ where: { status: "CLOSED" } });
    for (const item of items) {
      expect(item.merchantShare!.plus(item.platformShare!).toFixed(2)).toBe(
        item.charge!.toFixed(2),
      );
      const rent = await db.walletEntry.findMany({
        where: { rentalItemId: item.id, idempotencyKey: { startsWith: `rent:${item.id}:` } },
      });
      const paid = rent.reduce(
        (sum, e) => (e.kind === "CHARGE" ? sum.plus(e.amount) : sum.minus(e.amount)),
        item.charge!.minus(item.charge!),
      );
      expect(paid.toFixed(2)).toBe(item.charge!.toFixed(2));
      expect(item.rentPaid.toFixed(2)).toBe(item.charge!.toFixed(2));
    }
  });

  it("skips merchants without a payout account", async () => {
    const ctx = await merchantCtx();
    await closedRental(ctx, 10);
    await db.merchant.update({ where: { id: ctx.merchantId }, data: { payoutAccount: null } });
    const { results } = await runPayoutBatch(day(20));
    expect(results[0].skipped).toBe("no payout account");
    expect(await db.payout.count()).toBe(0);
  });
});

describe("disputes (§6)", () => {
  it("an upheld damage claim charges the borrower's tokens and adds it to the merchant's payout", async () => {
    const ctx = await merchantCtx();
    const admin = await makeUser("ADMIN");
    const { rental, item } = await closedRental(ctx, 10, 10, true);
    const dispute = await db.dispute.findFirstOrThrow({ where: { rentalItemId: item.id } });

    await decideDispute(admin.id, dispute.id, {
      resolution: "CHARGE_DEPOSIT",
      amount: "1500",
      decision: "Torn sole in return photos",
    });
    const damage = await db.walletEntry.findFirstOrThrow({
      where: { rentalId: rental.id, kind: "CHARGE", note: "Damage" },
    });
    expect(damage.amount.toFixed(2)).toBe("1500.00");
    // Decided: the pair's locked value is released and nothing stays locked.
    expect((await rentalLocked(rental.id)).toFixed(2)).toBe("0.00");

    const { results } = await runPayoutBatch(day(20));
    expect(results[0].amount).toBe(item.merchantShare!.plus(1500).toFixed(2));
  });

  it("an upheld overcharge refunds the borrower and comes off the merchant's payout", async () => {
    const ctx = await merchantCtx();
    const admin = await makeUser("ADMIN");
    const { borrower, rental, item } = await closedRental(ctx, 10, 30);
    const dispute = await openDispute(
      borrower.id,
      item.id,
      "I was charged for days the courier held it",
      day(11),
    );

    await expect(
      decideDispute(admin.id, dispute.id, {
        resolution: "REFUND_BORROWER",
        amount: "999999",
        decision: "Too much",
      }),
    ).rejects.toThrow(/this rental's charge/);
    const before = await db.shoe.findUniqueOrThrow({ where: { id: item.shoeId } });
    await decideDispute(admin.id, dispute.id, {
      resolution: "REFUND_BORROWER",
      amount: "50",
      decision: "Courier delay",
    });
    const refund = await db.walletEntry.findFirstOrThrow({
      where: { rentalId: rental.id, kind: "CREDIT", note: "Refund of rent" },
    });
    expect(refund.amount.toFixed(2)).toBe("50.00");

    const { results } = await runPayoutBatch(day(20));
    expect(results[0].amount).toBe(item.merchantShare!.minus(50).toFixed(2));
    // Merchant first: the refund lowers the merchant's running total, so later rentals of
    // this shoe pay it back to them before the platform earns.
    const after = await db.shoe.findUniqueOrThrow({ where: { id: item.shoeId } });
    expect(after.merchantCollected.toFixed(2)).toBe(before.merchantCollected.minus(50).toFixed(2));
  });

  it("only the borrower or merchant can open one, within the window, one at a time", async () => {
    const ctx = await merchantCtx();
    const stranger = await makeUser("BORROWER");
    const admin = await makeUser("ADMIN");
    const { borrower, item } = await closedRental(ctx, 10);

    await expect(
      openDispute(stranger.id, item.id, "Not my rental at all", day(11)),
    ).rejects.toThrow(/not found/);
    await expect(openDispute(borrower.id, item.id, "short", day(11))).rejects.toThrow(DisputeError);
    await expect(
      openDispute(borrower.id, item.id, "Too late to complain now", day(14)),
    ).rejects.toThrow(/window/);

    const d = await openDispute(ctx.merchantUserId, item.id, "Laces missing on return", day(11));
    await expect(
      openDispute(borrower.id, item.id, "Another complaint here", day(11)),
    ).rejects.toThrow(/already/);
    await decideDispute(admin.id, d.id, {
      resolution: "NO_ACTION",
      decision: "Laces in the box photo",
    });
    expect((await db.dispute.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("REJECTED");
    await expect(
      decideDispute(admin.id, d.id, { resolution: "NO_ACTION", decision: "again" }),
    ).rejects.toThrow(/already/);
  });
});
