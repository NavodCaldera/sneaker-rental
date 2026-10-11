import "server-only";
import { D, roundMoney, toD } from "@/lib/decimal";
import { type LedgerItem, type LedgerShoe, estimate } from "@/lib/wear-ledger";
import { shoeCurve } from "../catalogue/pricing";
import { endRental } from "../booking/lifecycle";
import { asOfToday, loadHoldings } from "../booking/holdings";
import { liveCharge } from "../booking/queries";
import { db } from "../db";
import { getActiveSettings } from "../settings";
import { lockMore, rentalLocked } from "./index";

/** Pairs whose value must stay locked: not yet delivered, held, or on their way back. */
const OUT = ["AWAITING_DELIVERY", "WAITING_HANDOFF", "ACTIVE", "RETURNING"] as const;

export type CoverResult = {
  rentalId: string;
  needed: string;
  locked: string;
  state: "covered" | "auto-locked" | "top-up requested" | "waiting" | "recalled";
};

/**
 * Tokens a rental needs locked right now (pricing-spec.md §6): the merchant value of every
 * pair still out, plus the rent run up so far and not yet charged, plus the next
 * `topUpLeadDays` days' rent for pairs still held.
 */
async function coverNeeded(rentalId: string, now: Date, leadDays: number) {
  const rental = await db.rental.findUniqueOrThrow({
    where: { id: rentalId },
    include: {
      items: {
        where: { status: { in: [...OUT] } },
        include: { shoe: { include: { settings: true } } },
      },
    },
  });
  const today = asOfToday(now);
  const holdings = await loadHoldings(db, rental.borrowerId);

  let needed = new D(0);
  const ahead: LedgerItem[] = [];
  const shoes = new Map<string, LedgerShoe>();
  for (const item of rental.items) {
    needed = needed.plus(toD(item.shoe.value));
    const live = liveCharge(item, holdings, today);
    if (!live) continue;
    needed = needed.plus(live.chargeSoFar);
    if (item.status === "ACTIVE" && !item.lastDay && leadDays > 0) {
      const { params, settings, collected } = shoeCurve(item.shoe);
      shoes.set(item.id, {
        id: item.id,
        curve: params,
        wear: live.wearNow,
        collected,
        lostToDiscounts: new D(0),
        catchUp: settings.catchUp,
      });
      ahead.push({
        id: item.id,
        borrowerId: rental.borrowerId,
        shoeId: item.id,
        start: today + 1,
        end: today + leadDays,
        discount: toD(item.discount),
      });
    }
  }
  if (ahead.length > 0) {
    const next = estimate(ahead, shoes, () => 0, { maxPairs: Math.max(ahead.length, 1) });
    needed = needed.plus(next.totalUnrounded);
  }
  return { rental, needed: roundMoney(needed) };
}

/**
 * The daily overrun check. For each open rental whose locked tokens no longer cover what it
 * needs: lock more of the borrower's free tokens; if that isn't enough, ask them to top up
 * within `topUpGraceDays`; once that passes, recall the pairs (end the rentals, so a driver
 * collects them). Safe to run more than once a day.
 */
export async function checkWalletCover(
  now = new Date(),
  filter: { borrowerId?: string } = {},
): Promise<CoverResult[]> {
  const settings = await getActiveSettings(now);
  const rentals = await db.rental.findMany({
    where: {
      status: "ACTIVE",
      recalledAt: null,
      ...(filter.borrowerId && { borrowerId: filter.borrowerId }),
      items: { some: { status: { in: ["ACTIVE"] } } },
    },
    select: { id: true },
  });

  const results: CoverResult[] = [];
  for (const { id } of rentals) {
    const { rental, needed } = await coverNeeded(id, now, settings.topUpLeadDays);
    const result = await db.$transaction(async (tx) => {
      let locked = await rentalLocked(id, tx);
      const report = (state: CoverResult["state"]) => ({
        rentalId: id,
        needed: needed.toFixed(2),
        locked: locked.toFixed(2),
        state,
      });
      if (locked.gte(needed)) {
        if (rental.topUpDueAt) {
          await tx.rental.update({ where: { id }, data: { topUpDueAt: null, topUpAmount: null } });
        }
        return report("covered");
      }
      const got = await lockMore(
        tx,
        rental.borrowerId,
        id,
        needed.minus(locked),
        `cover:${id}:${now.toISOString()}`,
      );
      locked = locked.plus(got);
      const short = needed.minus(locked);
      if (short.lte(0)) {
        await tx.rental.update({ where: { id }, data: { topUpDueAt: null, topUpAmount: null } });
        return report("auto-locked");
      }
      if (!rental.topUpDueAt) {
        await tx.rental.update({
          where: { id },
          data: {
            topUpDueAt: new Date(now.getTime() + settings.topUpGraceDays * 86_400_000),
            topUpAmount: short.toFixed(2),
          },
        });
        return report("top-up requested");
      }
      if (now < rental.topUpDueAt) {
        await tx.rental.update({ where: { id }, data: { topUpAmount: short.toFixed(2) } });
        return report("waiting");
      }
      await tx.rental.update({ where: { id }, data: { recalledAt: now } });
      return report("recalled");
    });
    if (result.state === "recalled") {
      // End every pair still held: charging stops today and a driver collects it.
      for (const item of rental.items.filter((i) => i.status === "ACTIVE")) {
        await endRental(rental.borrowerId, item.id, now);
      }
    }
    results.push(result);
  }
  return results;
}
