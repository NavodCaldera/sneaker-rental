import "server-only";
import type { RentalItemStatus } from "@/generated/prisma/client";
import { D, toD } from "@/lib/decimal";
import { formatDateTime, formatTokens, formatWear } from "@/lib/format";
import { catchUpPhi, chargedAmounts, incomeBetween } from "@/lib/pricing";
import {
  type Day,
  type Holding,
  chainWear,
  colomboDay,
  dateToDay,
  plannedLastDay,
  wearAdded,
} from "@/lib/wear-ledger";
import { type PricedShoe, shoeCurve } from "../catalogue/pricing";
import type { Tx } from "../db";
import { notify } from "../notify";
import { settleRent } from "../payments";
import { type SettingsRow, getActiveSettings } from "../settings";

/**
 * Planning (pricing-spec.md §6a). Rent for a booked term is paid upfront and the pair's wear
 * is committed at once. Every open item has a planned holding; the wear ledger splits each
 * borrower's days 1/n across their pairs, each pair's open items are chained from its settled
 * wear, and the pricing engine prices each item. `replan` stores the result and settles any
 * change in tokens.
 */

/** Items still to be settled: booked, reserved next, held, or on their way back. */
export const OPEN_STATUSES: RentalItemStatus[] = [
  "AWAITING_DELIVERY",
  "WAITING_HANDOFF",
  "ACTIVE",
  "RETURNING",
];

export type PlanItem = {
  id: string;
  borrowerId: string;
  shoeId: string;
  status: RentalItemStatus;
  createdAt: Date;
  firstDay: Day | null;
  lastDay: Day | null;
  termEndDay: Day | null;
  plannedDays: number | null;
  discount: D;
  phi: D;
};

export type PlanShoe = PricedShoe & { id: string };

export type ItemPlan = {
  itemId: string;
  shoeId: string;
  /** Planned holding, both days inclusive */
  firstDay: Day;
  lastDay: Day;
  wearStart: D;
  wearEnd: D;
  /** Unrounded rent for the planned holding */
  income: D;
  /** Rounded rent: what the borrower pays for the plan */
  charge: D;
};

export type Plan = { items: Map<string, ItemPlan>; committedWear: Map<string, D> };

const isOpen = (status: RentalItemStatus) => OPEN_STATUSES.includes(status);

/** A pair's open items in the order they hold it: started ones by first day, then the queue. */
function holdOrder(a: PlanItem, b: PlanItem) {
  const rank = (i: PlanItem) => (i.status === "WAITING_HANDOFF" ? 2 : i.firstDay === null ? 1 : 0);
  return (
    rank(a) - rank(b) ||
    (a.firstDay ?? 0) - (b.firstDay ?? 0) ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}

/**
 * Plan every open item in `items`. `items` must hold every item (open or closed, not
 * cancelled) of each borrower with an open item here, and every open item of each pair, or
 * the 1/n split and the chains come out wrong (`loadPlanItems` does this).
 */
export function planItems(items: PlanItem[], shoes: Map<string, PlanShoe>, today: Day): Plan {
  const tomorrow = today + 1;
  const open = items.filter((i) => isOpen(i.status));

  // Planned holding of each open item, pair by pair: a reservation starts the day after the
  // previous holder's driver comes (their last day + 2), and tomorrow at the earliest.
  const byShoe = new Map<string, PlanItem[]>();
  for (const i of open) byShoe.set(i.shoeId, [...(byShoe.get(i.shoeId) ?? []), i]);
  const period = new Map<string, { start: Day; end: Day }>();
  for (const list of byShoe.values()) {
    list.sort(holdOrder);
    let prevEnd: Day | null = null;
    for (const i of list) {
      const days = i.plannedDays ?? 1;
      let start: Day;
      let end: Day;
      if (i.firstDay !== null) {
        start = i.firstDay;
        // A legacy open-ended rental (no term) counts through today.
        end = i.lastDay ?? i.termEndDay ?? (i.plannedDays ? plannedLastDay(start, days) : today);
      } else {
        start =
          i.status === "WAITING_HANDOFF" && prevEnd !== null
            ? Math.max(tomorrow, prevEnd + 2)
            : tomorrow;
        end = plannedLastDay(start, days);
      }
      period.set(i.id, { start, end });
      prevEnd = prevEnd === null ? end : Math.max(prevEnd, end);
    }
  }

  // Each borrower's holdings: closed ones as they happened, open ones as planned.
  const holdings = new Map<string, Holding[]>();
  for (const i of items) {
    const p = period.get(i.id);
    const h: Holding | null = p
      ? { itemId: i.id, start: p.start, end: p.end }
      : i.status !== "CANCELLED" && i.firstDay !== null && i.lastDay !== null
        ? { itemId: i.id, start: i.firstDay, end: i.lastDay }
        : null;
    if (h) holdings.set(i.borrowerId, [...(holdings.get(i.borrowerId) ?? []), h]);
  }

  const plans = new Map<string, ItemPlan>();
  const committedWear = new Map<string, D>();
  for (const [shoeId, list] of byShoe) {
    const shoe = shoes.get(shoeId);
    if (!shoe) throw new Error(`Shoe ${shoeId} missing from the plan`);
    const { params, settings, collected } = shoeCurve(shoe);
    const added = list.map((i) => wearAdded(holdings.get(i.borrowerId)!, i.id));
    const chain = chainWear(toD(shoe.wear), added, shoe.lifespanDays, !params.pastLife);
    list.forEach((i, k) => {
      const { start, end } = chain[k];
      const phi = settings.catchUp ? catchUpPhi(params, collected, start) : i.phi;
      const { income, undiscounted } = incomeBetween(params, start, end, i.discount, phi);
      const { charge } = chargedAmounts(income, { merchantOutstanding: 0, undiscounted });
      const p = period.get(i.id)!;
      plans.set(i.id, {
        itemId: i.id,
        shoeId,
        firstDay: p.start,
        lastDay: p.end,
        wearStart: start,
        wearEnd: end,
        income,
        charge,
      });
    });
    committedWear.set(shoeId, chain.length ? chain[chain.length - 1].end : toD(shoe.wear));
  }
  return { items: plans, committedWear };
}

const itemFields = {
  id: true,
  rentalId: true,
  shoeId: true,
  status: true,
  createdAt: true,
  firstDay: true,
  lastDay: true,
  termEndDay: true,
  plannedDays: true,
  discount: true,
  phi: true,
  plannedCharge: true,
  plannedWearStart: true,
  rentPaid: true,
  offerCharge: true,
  offerDueAt: true,
  rental: { select: { borrowerId: true } },
} as const;

type Row = Awaited<ReturnType<typeof loadRows>>[number];

async function loadRows(tx: Tx, borrowerIds: string[], shoeIds: string[]) {
  return tx.rentalItem.findMany({
    where: {
      status: { not: "CANCELLED" },
      OR: [
        { rental: { borrowerId: { in: borrowerIds } } },
        { status: { in: OPEN_STATUSES }, shoeId: { in: shoeIds } },
      ],
    },
    select: { ...itemFields, shoe: { select: { brand: true, model: true } } },
  });
}

export function toPlanItem(r: Row): PlanItem {
  const day = (d: Date | null) => (d ? dateToDay(d) : null);
  return {
    id: r.id,
    borrowerId: r.rental.borrowerId,
    shoeId: r.shoeId,
    status: r.status,
    createdAt: r.createdAt,
    firstDay: day(r.firstDay),
    lastDay: day(r.lastDay),
    termEndDay: day(r.termEndDay),
    plannedDays: r.plannedDays,
    discount: toD(r.discount),
    phi: toD(r.phi),
  };
}

/**
 * Everything a plan touching these borrowers and pairs needs: grows the sets until every
 * borrower with an open item on one of the pairs, and every pair one of the borrowers has
 * open, is in.
 */
export async function loadPlanItems(tx: Tx, seed: { borrowerIds?: string[]; shoeIds?: string[] }) {
  const borrowers = new Set(seed.borrowerIds ?? []);
  const shoeIds = new Set(seed.shoeIds ?? []);
  for (let round = 0; round < 20; round++) {
    const before = borrowers.size + shoeIds.size;
    const open = await tx.rentalItem.findMany({
      where: {
        status: { in: OPEN_STATUSES },
        OR: [{ shoeId: { in: [...shoeIds] } }, { rental: { borrowerId: { in: [...borrowers] } } }],
      },
      select: { shoeId: true, rental: { select: { borrowerId: true } } },
    });
    for (const o of open) {
      shoeIds.add(o.shoeId);
      borrowers.add(o.rental.borrowerId);
    }
    if (borrowers.size + shoeIds.size === before) break;
  }
  const rows = await loadRows(tx, [...borrowers], [...shoeIds]);
  const shoeRows = await tx.shoe.findMany({
    where: { id: { in: [...shoeIds] } },
    include: { settings: true },
  });
  return { rows, shoes: new Map(shoeRows.map((s) => [s.id, s])) };
}

/**
 * Plan the open items of these borrowers and pairs again and store the result: each item's
 * planned wear and rent, each pair's committed wear. Rent changes are settled in tokens at
 * once (refund, or charge from the free balance), except a higher price for a reservation
 * that hasn't started: that becomes an offer the borrower must accept (§6a). Borrowers other
 * than `actorId` are told about refunds. Returns the items with an offer pending.
 */
export async function replan(
  tx: Tx,
  seed: { borrowerIds?: string[]; shoeIds?: string[] },
  now: Date,
  options: { actorId?: string; settings?: SettingsRow } = {},
): Promise<{ offers: string[] }> {
  const { rows, shoes } = await loadPlanItems(tx, seed);
  const plan = planItems(rows.map(toPlanItem), shoes, colomboDay(now));
  const offers: string[] = [];

  for (const [shoeId, committed] of plan.committedWear) {
    if (!toD(shoes.get(shoeId)!.committedWear).eq(committed)) {
      await tx.shoe.update({
        where: { id: shoeId },
        data: { committedWear: committed.toString() },
      });
    }
  }
  // Shoes whose open items have all gone: committed = settled wear.
  for (const shoe of shoes.values()) {
    if (!plan.committedWear.has(shoe.id) && !toD(shoe.committedWear).eq(toD(shoe.wear))) {
      await tx.shoe.update({ where: { id: shoe.id }, data: { committedWear: shoe.wear } });
    }
  }

  for (const row of rows) {
    const p = plan.items.get(row.id);
    if (!p) continue;
    const borrowerId = row.rental.borrowerId;
    const name = `${row.shoe.brand} ${row.shoe.model}`;
    const agreed = row.plannedCharge === null ? null : toD(row.plannedCharge);

    if (row.status === "WAITING_HANDOFF" && agreed !== null && p.charge.gt(agreed)) {
      offers.push(row.id);
      if (row.offerCharge !== null && toD(row.offerCharge).eq(p.charge)) continue;
      const settings = options.settings ?? (await getActiveSettings(now));
      const dueAt =
        row.offerDueAt ?? new Date(now.getTime() + settings.offerResponseHours * 3_600_000);
      await tx.rentalItem.update({
        where: { id: row.id },
        data: {
          offerCharge: p.charge.toFixed(2),
          offerWearStart: p.wearStart.toString(),
          offerDueAt: dueAt,
        },
      });
      const shownBefore = row.plannedWearStart === null ? null : toD(row.plannedWearStart);
      await notify(tx, {
        userId: borrowerId,
        kind: "PRICE_OFFER",
        rentalItemId: row.id,
        link: "/rentals",
        title: `${name}: coming to you early, at a new price`,
        body:
          `The borrower before you is ending their rental of the ${name} early, so it will ` +
          `have less wear than we showed when you booked` +
          (shownBefore
            ? ` (${formatWear(p.wearStart)} wear-days used, not ${formatWear(shownBefore)})`
            : "") +
          `. A pair with less wear costs more per day, so your ${row.plannedDays}-day rent is ` +
          `now ${formatTokens(p.charge)} instead of ${formatTokens(agreed)}. Accept by ` +
          `${formatDateTime(dueAt)} to keep your reservation, and a driver brings it to you ` +
          `as soon as they hand it back. Reject, or don't answer in time, and we refund your ` +
          `rent and unlock your deposit.`,
      });
      continue;
    }

    const changed =
      agreed === null ||
      !agreed.eq(p.charge) ||
      row.plannedWearStart === null ||
      !toD(row.plannedWearStart).eq(p.wearStart) ||
      row.offerCharge !== null;
    if (changed) {
      await tx.rentalItem.update({
        where: { id: row.id },
        data: {
          plannedWearStart: p.wearStart.toString(),
          plannedWearEnd: p.wearEnd.toString(),
          plannedCharge: p.charge.toFixed(2),
          offerCharge: null,
          offerWearStart: null,
          offerDueAt: null,
        },
      });
    }
    const delta = await settleRent(tx, {
      userId: borrowerId,
      rentalId: row.rentalId,
      itemId: row.id,
      rentPaid: toD(row.rentPaid),
      target: p.charge,
      note: {
        charge: agreed === null ? `Rent: ${name}, ${row.plannedDays} days` : `Rent change: ${name}`,
        refund: `Rent refund: ${name}`,
      },
    });
    if (delta.lt(0) && borrowerId !== options.actorId) {
      await notify(tx, {
        userId: borrowerId,
        kind: "REFUND",
        rentalItemId: row.id,
        link: "/wallet",
        title: `${name}: ${formatTokens(delta.neg())} refunded`,
        body:
          `The rent for your ${name} went down to ${formatTokens(p.charge)}, so we've added ` +
          `${formatTokens(delta.neg())} back to your tokens.`,
      });
    }
  }
  return { offers };
}
