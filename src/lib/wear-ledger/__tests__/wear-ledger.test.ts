import { describe, expect, it } from "vitest";
import { D } from "../../decimal";
import { DEFAULT_PRICING_SETTINGS as S, curveParams } from "../../pricing";
import {
  type Holding,
  type LedgerItem,
  chainWear,
  colomboDay,
  dateToDay,
  dayToDate,
  firstDayAfterDelivery,
  plannedLastDay,
  receiverFirstDay,
  runLedger,
  wearAdded,
  wearEnd,
} from "..";

/** Holding with inclusive first and last days. */
const h = (itemId: string, start: number, end: number | null): Holding => ({ itemId, start, end });

describe("wear ledger (inclusive days)", () => {
  it("one pair held days 0–9 adds 10 wear-days", () => {
    expect(wearAdded([h("a", 0, 9)], "a").eq(10)).toBe(true);
  });

  it("four pairs held together for 10 days add 2.5 wear-days each", () => {
    const holdings = ["a", "b", "c", "d"].map((id) => h(id, 0, 9));
    for (const id of ["a", "b", "c", "d"]) expect(wearAdded(holdings, id).eq("2.5")).toBe(true);
  });

  it("overlapping items with different dates split only the shared days", () => {
    // a: days 0–9; b: days 4–13. Shared days 4–9 (6 days).
    const holdings = [h("a", 0, 9), h("b", 4, 13)];
    expect(wearAdded(holdings, "a").eq(4 + 6 / 2)).toBe(true); // 7
    expect(wearAdded(holdings, "b").eq(6 / 2 + 4)).toBe(true); // 7
  });

  it("total wear per day across the bundle is always one wear-day", () => {
    const holdings = [h("a", 0, 6), h("b", 2, 11), h("c", 5, 8)];
    const total = holdings.reduce((sum, x) => sum.plus(wearAdded(holdings, x.itemId)), new D(0));
    expect(total.eq(12)).toBe(true); // days 0–11, one wear-day each
  });

  it("other open items count as held when an item closes", () => {
    const holdings = [h("a", 0, 5), h("b", 0, null)];
    expect(wearAdded(holdings, "a").eq(3)).toBe(true);
    // b, still open, counted through day 9: days 0–5 shared, 6–9 alone.
    expect(wearAdded(holdings, "b", 9).eq(3 + 4)).toBe(true);
  });

  it("ignores holdings that don't overlap", () => {
    const holdings = [h("a", 10, 19), h("old", 0, 9), h("later", 20, 29)];
    expect(wearAdded(holdings, "a").eq(10)).toBe(true);
  });

  it("same-day pickup and return counts as one day held", () => {
    expect(wearAdded([h("a", 5, 5)], "a").eq(1)).toBe(true);
  });

  it("a holding that ends before it starts (handoff in, returned the same day) adds nothing", () => {
    expect(wearAdded([h("a", 6, 5)], "a").eq(0)).toBe(true);
  });

  it("caps wear at L", () => {
    expect(wearEnd("360", "10", 365).eq(365)).toBe(true);
    expect(wearEnd("100", "2.5", 365).eq("102.5")).toBe(true);
  });

  it("rejects unknown items and open holdings without an end", () => {
    expect(() => wearAdded([h("a", 0, 1)], "zzz")).toThrow(RangeError);
    expect(() => wearAdded([h("a", 0, null)], "a")).toThrow(RangeError);
  });

  it("matches the daily accrual ledger day for day", () => {
    const items: LedgerItem[] = [
      { id: "a", borrowerId: "u", shoeId: "A", start: 1, end: 30 },
      { id: "b", borrowerId: "u", shoeId: "B", start: 5, end: 12 },
      { id: "c", borrowerId: "u", shoeId: "C", start: 12, end: 40 },
      { id: "d", borrowerId: "u", shoeId: "D", start: 20, end: 20 },
    ];
    const curve = curveParams(6000, 1000, S);
    const shoes = new Map(
      ["A", "B", "C", "D"].map((id) => [
        id,
        {
          id,
          curve,
          wear: new D(0),
          collected: new D(0),
          lostToDiscounts: new D(0),
          catchUp: false,
        },
      ]),
    );
    const { results } = runLedger(items, shoes, 1, 40, { maxPairs: 4 });
    const holdings = items.map((i) => h(i.id, i.start, i.end));
    for (const i of items) {
      expect(wearAdded(holdings, i.id).eq(results.get(i.id)!.wearAdded), i.id).toBe(true);
    }
  });
});

describe("days", () => {
  it("uses Colombo calendar days (UTC+05:30)", () => {
    // 18:29 UTC = 23:59 Colombo, 18:30 UTC = 00:00 next day in Colombo
    const before = colomboDay(new Date("2026-10-10T18:29:00Z"));
    const after = colomboDay(new Date("2026-10-10T18:30:00Z"));
    expect(after - before).toBe(1);
    expect(colomboDay(new Date("2026-10-10T00:00:00+05:30"))).toBe(before);
  });

  it("converts day numbers to date-only values and back", () => {
    const day = colomboDay(new Date("2026-10-11T09:00:00+05:30"));
    expect(dayToDate(day).toISOString()).toBe("2026-10-11T00:00:00.000Z");
    expect(dateToDay(dayToDate(day))).toBe(day);
  });

  it("day 1 is the day after delivery; the delivery day is free", () => {
    const at = new Date("2026-10-11T23:30:00+05:30");
    expect(firstDayAfterDelivery(at)).toBe(colomboDay(at) + 1);
  });

  it("a handoff receiver starts the day after delivery, or after the giver's last day", () => {
    const at = new Date("2026-10-11T15:00:00+05:30");
    const day = colomboDay(at);
    expect(receiverFirstDay(at, day - 3)).toBe(day + 1); // giver ended 3 days ago: waiting was free
    expect(receiverFirstDay(at, day + 2)).toBe(day + 3); // giver's term runs past delivery
    expect(receiverFirstDay(at, null)).toBe(day + 1);
  });
});

describe("planned days", () => {
  it("a 90-day plan starting on day 1 ends on day 90", () => {
    expect(plannedLastDay(1, 90)).toBe(90);
    expect(plannedLastDay(5, 1)).toBe(5);
  });

  it("chains a pair's open items: each starts where the last one's plan ends, capped at L unless wear past L is charged", () => {
    const chain = chainWear("0", ["90", "45"], 365);
    expect(chain.map((c) => [c.start.toString(), c.end.toString()])).toEqual([
      ["0", "90"],
      ["90", "135"],
    ]);
    const capped = chainWear("300", ["50", "30"], 365);
    expect(capped.map((c) => c.end.toString())).toEqual(["350", "365"]);
    expect(chainWear("10", [], 365)).toEqual([]);
    // Wear past L charged (chargePastLife): no cap, so the chain keeps counting.
    const uncapped = chainWear("300", ["50", "30"], 365, false);
    expect(uncapped.map((c) => c.end.toString())).toEqual(["350", "380"]);
    expect(wearEnd("360", "10", 365, false).eq(370)).toBe(true);
  });
});

describe("wear helpers", () => {
  it("caps added wear, never goes negative on remaining, and flags end of life", async () => {
    const { cappedWearAdded, wearRemaining, atEndOfLife, lifeLeft } = await import("..");
    expect(cappedWearAdded("360", "10", 365).eq(5)).toBe(true);
    expect(cappedWearAdded("100", "2.5", 365).eq("2.5")).toBe(true);
    expect(wearRemaining("100", 365).eq(265)).toBe(true);
    expect(wearRemaining("400", 365).eq(0)).toBe(true);
    expect(lifeLeft("73", 365).eq("0.8")).toBe(true);
    expect(atEndOfLife("365", 365)).toBe(true);
    expect(atEndOfLife("364.99", 365)).toBe(false);
  });
});

describe("ledger guards", () => {
  const curve = curveParams(6000, 365, S);
  const shoe = () => ({
    id: "A",
    curve,
    wear: new D(0),
    collected: new D(0),
    lostToDiscounts: new D(0),
    catchUp: false,
  });
  const opts = { maxPairs: 4 };
  const owedFor = () => 0;

  it("rejects unknown shoes, items that end before they start and bad dates", async () => {
    const { estimate, dayNumber } = await import("..");
    const shoes = new Map([["A", shoe()]]);
    const item = { id: "a", borrowerId: "u", shoeId: "A", start: 5, end: 9 };
    expect(() => runLedger([{ ...item, shoeId: "Z" }], shoes, 1, 9, opts)).toThrow(/Unknown shoe/);
    expect(() => runLedger([{ ...item, end: 4 }], shoes, 1, 9, opts)).toThrow(/ends before/);
    expect(() => estimate([{ ...item, end: null }], shoes, owedFor, opts)).toThrow(/planned/);
    expect(estimate([], shoes, owedFor, opts).total.eq(0)).toBe(true);
    expect(() => dayNumber("11/10/2026")).toThrow(RangeError);
  });

  it("an open item for one shoe blocks any later item for it", () => {
    const shoes = new Map([["A", shoe()]]);
    const items = [
      { id: "a", borrowerId: "u", shoeId: "A", start: 1, end: null },
      { id: "b", borrowerId: "v", shoeId: "A", start: 50, end: 60 },
    ];
    expect(() => runLedger(items, shoes, 1, 60, opts)).toThrow(/double-booked/);
  });
});
