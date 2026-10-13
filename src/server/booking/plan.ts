import "server-only";
import type { RentalItemStatus } from "@/generated/prisma/client";
import { D, roundMoney, toD } from "@/lib/decimal";
import { formatDate, formatDateTime, formatTokens, formatWear } from "@/lib/format";
import { catchUpPhi, chargedAmounts, incomeBetween } from "@/lib/pricing";
import {
  type Day,
  type Holding,
  birthdayFreeRanges,
  birthdayWindows,
  chainWear,
  colomboDay,
  dateToDay,
  dayToDate,
  plannedLastDay,
  wearAdded,
  wearOverRanges,
} from "@/lib/wear-ledger";
import { type PricedShoe, shoeCurve } from "../catalogue/pricing";
import type { Tx } from "../db";
import { notify } from "../notify";
import { lockRent } from "../payments";
import { type SettingsRow, getActiveSettings } from "../settings";
import { shoeName } from "@/lib/shoe-name";

/**
 * Planning (pricing-spec.md §6a). A booked term's rent estimate is locked at booking and the
 * pair's wear is committed at once; the rent itself is charged when the item closes. Every
 * open item has a planned holding; the wear ledger splits each borrower's days 1/n across
 * their pairs, each pair's open items are chained from its settled wear, and the pricing
 * engine prices each item. `replan` stores the result and moves each rent lock to match.
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
  /** Rent waived for the borrower's birthday month (pricing-spec.md §8a), unrounded */
  birthdayFree: D;
};

/**
 * The birthday month (product owner, 2026-10-13): each borrower's date of birth
 * ('YYYY-MM-DD', when known) and how many pairs held at once are rent-free in that month.
 */
export type BirthdayGift = { datesOfBirth: Map<string, string>; freePairs: number };

export const NO_BIRTHDAY_GIFT: BirthdayGift = { datesOfBirth: new Map(), freePairs: 0 };

/**
 * The wear intervals of an item that are rent-free for its borrower's birthday month: the
 * wear it gains on birthday-month days while it is among their first `freePairs` pairs.
 * `wearStart` is the item's starting wear; the pricing engine clips them to its interval.
 */
export function birthdayFreeWear(
  holdings: Holding[],
  itemId: string,
  wearStart: D,
  period: { start: Day; end: Day },
  dateOfBirth: string | undefined,
  freePairs: number,
): [D, D][] {
  if (!dateOfBirth || freePairs <= 0) return [];
  const windows = birthdayWindows(dateOfBirth, period.start, period.end);
  const ranges = birthdayFreeRanges(holdings, itemId, windows, freePairs, period.end);
  return wearOverRanges(holdings, itemId, ranges).map(
    ([a, b]) => [wearStart.plus(a), wearStart.plus(b)] as [D, D],
  );
}

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
export function planItems(
  items: PlanItem[],
  shoes: Map<string, PlanShoe>,
  today: Day,
  gift: BirthdayGift = NO_BIRTHDAY_GIFT,
): Plan {
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
      const p = period.get(i.id)!;
      const free = birthdayFreeWear(
        holdings.get(i.borrowerId)!,
        i.id,
        start,
        p,
        gift.datesOfBirth.get(i.borrowerId),
        gift.freePairs,
      );
      const { income, undiscounted, freeCost } = incomeBetween(
        params,
        start,
        end,
        i.discount,
        phi,
        free,
      );
      const { charge } = chargedAmounts(income, { merchantOutstanding: 0, undiscounted });
      plans.set(i.id, {
        itemId: i.id,
        shoeId,
        firstDay: p.start,
        lastDay: p.end,
        wearStart: start,
        wearEnd: end,
        income,
        charge,
        birthdayFree: freeCost,
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
  plannedFirstDay: true,
  plannedCharge: true,
  plannedBirthdayFree: true,
  plannedWearStart: true,
  rentPaid: true,
  offerFirstDay: true,
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
  const people = await tx.user.findMany({
    where: { id: { in: [...borrowers] }, dateOfBirth: { not: null } },
    select: { id: true, dateOfBirth: true },
  });
  const datesOfBirth = new Map(
    people.map((u) => [u.id, u.dateOfBirth!.toISOString().slice(0, 10)]),
  );
  return { rows, shoes: new Map(shoeRows.map((s) => [s.id, s])), datesOfBirth };
}

/**
 * Plan the open items of these borrowers and pairs again and store the result: each item's
 * planned first day, wear and rent, each pair's committed wear. Each item's rent lock follows
 * its rent estimate at once (lock more, or unlock), except for a reservation that would now
 * start earlier (its holder returns early) or cost more: that becomes an offer of the new
 * dates and price, which the borrower must accept (§6a). Borrowers other than `actorId` are
 * told about unlocked tokens. Returns the items with an offer pending.
 */
export async function replan(
  tx: Tx,
  seed: { borrowerIds?: string[]; shoeIds?: string[] },
  now: Date,
  options: { actorId?: string; settings?: SettingsRow } = {},
): Promise<{ offers: string[] }> {
  const { rows, shoes, datesOfBirth } = await loadPlanItems(tx, seed);
  const settings = options.settings ?? (await getActiveSettings(now));
  const plan = planItems(rows.map(toPlanItem), shoes, colomboDay(now), {
    datesOfBirth,
    freePairs: settings.birthdayFreePairs,
  });
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
    const name = shoeName(row.shoe);
    const agreed = row.plannedCharge === null ? null : toD(row.plannedCharge);
    const agreedFirst = row.plannedFirstDay === null ? null : dateToDay(row.plannedFirstDay);

    // A reservation that would start earlier (its holder is returning early) or cost more
    // needs the borrower's yes: it becomes an offer, and nothing else changes until then.
    const earlier = agreedFirst !== null && p.firstDay < agreedFirst;
    const dearer = agreed !== null && p.charge.gt(agreed);
    if (row.status === "WAITING_HANDOFF" && agreed !== null && (earlier || dearer)) {
      offers.push(row.id);
      const same =
        row.offerCharge !== null &&
        toD(row.offerCharge).eq(p.charge) &&
        row.offerFirstDay !== null &&
        dateToDay(row.offerFirstDay) === p.firstDay;
      if (same) continue;
      const dueAt =
        row.offerDueAt ?? new Date(now.getTime() + settings.offerResponseHours * 3_600_000);
      await tx.rentalItem.update({
        where: { id: row.id },
        data: {
          offerFirstDay: dayToDate(p.firstDay),
          offerCharge: p.charge.toFixed(2),
          offerWearStart: p.wearStart.toString(),
          offerDueAt: dueAt,
        },
      });
      await notify(tx, offerNotice(row, p, { name, agreed, agreedFirst, dueAt }));
      continue;
    }

    const changed =
      agreed === null ||
      !agreed.eq(p.charge) ||
      row.plannedBirthdayFree === null ||
      !toD(row.plannedBirthdayFree).eq(roundMoney(p.birthdayFree)) ||
      agreedFirst !== p.firstDay ||
      row.plannedWearStart === null ||
      !toD(row.plannedWearStart).eq(p.wearStart) ||
      row.offerCharge !== null;
    if (changed) {
      await tx.rentalItem.update({
        where: { id: row.id },
        data: {
          plannedFirstDay: dayToDate(p.firstDay),
          plannedWearStart: p.wearStart.toString(),
          plannedWearEnd: p.wearEnd.toString(),
          plannedCharge: p.charge.toFixed(2),
          plannedBirthdayFree: roundMoney(p.birthdayFree).toFixed(2),
          offerFirstDay: null,
          offerCharge: null,
          offerWearStart: null,
          offerDueAt: null,
        },
      });
    }
    // Rent is post-paid: lock the estimate now, charge the actual rent when the item closes.
    const delta = await lockRent(tx, {
      userId: borrowerId,
      rentalId: row.rentalId,
      itemId: row.id,
      charge: p.charge,
      rentPaid: toD(row.rentPaid),
      note: {
        lock:
          agreed === null
            ? `Rent estimate: ${name}, ${row.plannedDays} days`
            : `Rent estimate up: ${name}`,
        unlock: `Rent estimate down: ${name}`,
      },
    });
    if (delta.lt(0) && borrowerId !== options.actorId) {
      await notify(tx, {
        userId: borrowerId,
        kind: "REFUND",
        rentalItemId: row.id,
        link: "/wallet",
        title: `${name}: ${formatTokens(delta.neg())} unlocked`,
        body:
          `The rent estimate for your ${name} went down to ${formatTokens(p.charge)}, so ` +
          `we've unlocked ${formatTokens(delta.neg())} of your tokens.`,
      });
    }
  }
  return { offers };
}

/** The in-app and email notice for an offer of new dates and price (pricing-spec.md §6a). */
function offerNotice(
  row: Row,
  p: ItemPlan,
  ctx: { name: string; agreed: D; agreedFirst: Day | null; dueAt: Date },
) {
  const { name, agreed, agreedFirst, dueAt } = ctx;
  const earlier = agreedFirst !== null && p.firstDay < agreedFirst;
  const shownBefore = row.plannedWearStart === null ? null : toD(row.plannedWearStart);
  const wear =
    shownBefore && !shownBefore.eq(p.wearStart)
      ? ` It will have ${formatWear(p.wearStart)} days used, not ${formatWear(shownBefore)}, ` +
        `and a pair with less wear costs more per day.`
      : "";
  const price = p.charge.gt(agreed)
    ? `your ${row.plannedDays}-day rent estimate is now ${formatTokens(p.charge)} instead of ` +
      `${formatTokens(agreed)}`
    : `your ${row.plannedDays}-day rent estimate stays ${formatTokens(p.charge)}`;
  return {
    userId: row.rental.borrowerId,
    kind: "PRICE_OFFER" as const,
    rentalItemId: row.id,
    link: "/rentals",
    title: earlier ? `${name}: coming to you early, at a new price` : `${name}: a new price`,
    body:
      (earlier
        ? `The borrower before you is returning the ${name} early, so it can come to you ` +
          `with day 1 on ${formatDate(dayToDate(p.firstDay))} instead of ` +
          `${formatDate(dayToDate(agreedFirst!))}.`
        : `The ${name} will have less wear than we showed when you booked.`) +
      `${wear} ${earlier ? "With the new dates" : "So"}, ${price} (we lock the estimate and charge the actual wear ` +
      `when you return it). Accept by ${formatDateTime(dueAt)} to keep your reservation on ` +
      `these terms. If you'd rather keep your original dates, reject it or don't answer, and ` +
      `we cancel your reservation and unlock all its tokens.`,
  };
}
