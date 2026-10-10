import "server-only";
import { randomUUID } from "node:crypto";
import { D, toD } from "@/lib/decimal";
import { db } from "../db";
import { isoWeek } from "./week";

export { isoWeek };

/**
 * §4 rule 5: a rental's merchant share is payable after the dispute window, and payouts go
 * out weekly. Upheld deposit charges are added to the merchant's payout; upheld refunds come off.
 */

/** Items whose merchant share can be paid now. */
function eligibleWhere(now: Date) {
  return {
    status: { in: ["CLOSED" as const, "LOST" as const] },
    payoutId: null,
    payableAt: { lte: now },
    merchantShare: { not: null },
    disputes: { none: { status: "OPEN" as const } },
  };
}

type ItemForPayout = {
  merchantShare: { toString(): string } | null;
  disputes: { status: string; resolution: string | null; amount: { toString(): string } | null }[];
};

/** Merchant share plus upheld deposit charges, minus upheld refunds. */
export function payableAmount(item: ItemForPayout) {
  let amount = toD(item.merchantShare ?? 0);
  for (const d of item.disputes) {
    if (d.status !== "UPHELD" || !d.amount) continue;
    if (d.resolution === "CHARGE_DEPOSIT") amount = amount.plus(toD(d.amount));
    if (d.resolution === "REFUND_BORROWER") amount = amount.minus(toD(d.amount));
  }
  return amount;
}

/** Bank transfer adapter. OPEN DECISION: payout provider; the mock returns a reference. */
async function sendTransfer(_account: string, _amount: string, key: string) {
  return {
    ok: true as const,
    reference: `mock_transfer_${key.slice(0, 8)}_${randomUUID().slice(0, 8)}`,
  };
}

/**
 * The weekly batch: one payout per merchant with a payout account, covering every eligible
 * item. A merchant already paid this week waits for next week's batch.
 */
export async function runPayoutBatch(now = new Date()) {
  const batchKey = isoWeek(now);
  const items = await db.rentalItem.findMany({
    where: eligibleWhere(now),
    include: { shoe: { include: { merchant: true } }, disputes: true },
  });
  const byMerchant = new Map<string, typeof items>();
  for (const item of items) {
    const list = byMerchant.get(item.shoe.merchantId) ?? [];
    list.push(item);
    byMerchant.set(item.shoe.merchantId, list);
  }

  const results: {
    merchantId: string;
    businessName: string;
    amount: string;
    items: number;
    skipped?: string;
  }[] = [];
  for (const [merchantId, list] of byMerchant) {
    const merchant = list[0].shoe.merchant;
    if (!merchant.payoutAccount) {
      results.push({
        merchantId,
        businessName: merchant.businessName,
        amount: "0.00",
        items: list.length,
        skipped: "no payout account",
      });
      continue;
    }
    if (await db.payout.findUnique({ where: { merchantId_batchKey: { merchantId, batchKey } } })) {
      results.push({
        merchantId,
        businessName: merchant.businessName,
        amount: "0.00",
        items: list.length,
        skipped: "already paid this week",
      });
      continue;
    }
    const amount = list.reduce((sum, i) => sum.plus(payableAmount(i)), new D(0)).toFixed(2);
    const payout = await db.$transaction(async (tx) => {
      const payout = await tx.payout.create({ data: { merchantId, batchKey, amount } });
      // Claim the items; a concurrent batch can't claim them twice.
      const { count } = await tx.rentalItem.updateMany({
        where: { id: { in: list.map((i) => i.id) }, payoutId: null },
        data: { payoutId: payout.id },
      });
      if (count !== list.length)
        throw new Error("Payout items changed during the batch; run it again");
      return payout;
    });
    const transfer = await sendTransfer(merchant.payoutAccount, amount, payout.id);
    await db.payout.update({
      where: { id: payout.id },
      data: { status: "PAID", reference: transfer.reference, paidAt: new Date() },
    });
    results.push({ merchantId, businessName: merchant.businessName, amount, items: list.length });
  }
  return { batchKey, results };
}

/** What's waiting, per merchant, for the admin's payouts page. */
export async function payoutPreview(now = new Date()) {
  const items = await db.rentalItem.findMany({
    where: eligibleWhere(now),
    include: { shoe: { include: { merchant: true } }, disputes: true },
  });
  const map = new Map<
    string,
    { businessName: string; hasAccount: boolean; items: number; amount: D }
  >();
  for (const i of items) {
    const m = i.shoe.merchant;
    const row = map.get(m.id) ?? {
      businessName: m.businessName,
      hasAccount: !!m.payoutAccount,
      items: 0,
      amount: new D(0),
    };
    row.items += 1;
    row.amount = row.amount.plus(payableAmount(i));
    map.set(m.id, row);
  }
  return [...map.entries()].map(([merchantId, r]) => ({
    merchantId,
    ...r,
    amount: r.amount.toFixed(2),
  }));
}

export async function recentPayouts() {
  return db.payout.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { merchant: { select: { businessName: true } }, _count: { select: { items: true } } },
  });
}

/** A merchant's payouts and the closed rentals still waiting (dispute window or open dispute). */
export async function merchantPayouts(merchantId: string, now = new Date()) {
  const [payouts, waiting] = await Promise.all([
    db.payout.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: { shoe: { select: { brand: true, model: true } }, disputes: true } },
      },
    }),
    db.rentalItem.findMany({
      where: { shoe: { merchantId }, status: { in: ["CLOSED", "LOST"] }, payoutId: null },
      orderBy: { closedAt: "desc" },
      include: { shoe: { select: { brand: true, model: true } }, disputes: true },
    }),
  ]);
  return {
    payouts,
    waiting: waiting.map((i) => ({
      ...i,
      payable: payableAmount(i).toFixed(2),
      state: i.disputes.some((d) => d.status === "OPEN")
        ? ("disputed" as const)
        : i.payableAt && i.payableAt > now
          ? ("window" as const)
          : ("next-batch" as const),
    })),
  };
}
