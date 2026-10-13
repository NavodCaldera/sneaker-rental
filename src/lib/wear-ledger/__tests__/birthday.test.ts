import { describe, expect, it } from "vitest";
import { D } from "../../decimal";
import { DEFAULT_PRICING_SETTINGS as S, curveParams, incomeBetween } from "../../pricing";
import {
  type Holding,
  birthdayFreeRanges,
  birthdayWindows,
  dayNumber,
  wearAdded,
  wearOverRanges,
} from "..";

const h = (itemId: string, start: number, end: number | null): Holding => ({ itemId, start, end });
const day = dayNumber;

describe("birthday month (pricing-spec.md §8a)", () => {
  it("is the calendar month of the date of birth, every year, clipped to the range", () => {
    expect(birthdayWindows("1993-07-02", day("2026-06-20"), day("2026-08-10"))).toEqual([
      [day("2026-07-01"), day("2026-07-31")],
    ]);
    expect(birthdayWindows("1993-07-02", day("2026-07-10"), day("2026-07-12"))).toEqual([
      [day("2026-07-10"), day("2026-07-12")],
    ]);
    // A year-long term meets the month twice.
    expect(birthdayWindows("1990-03-30", day("2026-03-20"), day("2027-03-05"))).toEqual([
      [day("2026-03-20"), day("2026-03-31")],
      [day("2027-03-01"), day("2027-03-05")],
    ]);
    // 29 February: all of February, 28 days in 2027.
    expect(birthdayWindows("2000-02-29", day("2027-01-01"), day("2027-12-31"))).toEqual([
      [day("2027-02-01"), day("2027-02-28")],
    ]);
    expect(birthdayWindows("1993-07-02", day("2026-08-01"), day("2026-12-31"))).toEqual([]);
  });

  it("frees only the first pairs held, by the day they started", () => {
    const july = birthdayWindows("1993-07-02", day("2026-06-01"), day("2026-08-31"));
    // Five pairs from 25 June; the fifth (started last) pays until one of the first four goes.
    const holdings = [
      h("a", day("2026-06-25"), day("2026-08-20")),
      h("b", day("2026-06-25"), day("2026-07-10")),
      h("c", day("2026-06-26"), day("2026-08-20")),
      h("d", day("2026-06-27"), day("2026-08-20")),
      h("e", day("2026-06-28"), day("2026-08-20")),
    ];
    const free = (id: string) => birthdayFreeRanges(holdings, id, july, 4);
    expect(free("a")).toEqual([[day("2026-07-01"), day("2026-07-31")]]);
    expect(free("b")).toEqual([[day("2026-07-01"), day("2026-07-10")]]);
    expect(free("e")).toEqual([[day("2026-07-11"), day("2026-07-31")]]);
    // A pair that starts later in the month waits behind the first four.
    const late = [...holdings, h("f", day("2026-07-05"), day("2026-08-20"))];
    expect(birthdayFreeRanges(late, "f", july, 4)).toEqual([]);
    // Off: no free pairs.
    expect(birthdayFreeRanges(holdings, "a", july, 0)).toEqual([]);
  });

  it("waives the rent for the wear gained on those days, and only that", () => {
    const p = curveParams(new D(6000), 365, S);
    // One pair held 1–30 June, birthday 15 June: 15 days of 30 are free.
    const holdings = [h("a", day("2026-06-01"), day("2026-06-30"))];
    const windows = birthdayWindows("1993-06-15", day("2026-06-01"), day("2026-06-30"));
    const ranges = birthdayFreeRanges(holdings, "a", windows, 4);
    expect(ranges).toEqual([[day("2026-06-01"), day("2026-06-30")]]);

    // Born in July: a June–July term pays June only.
    const term = [h("a", day("2026-06-01"), day("2026-07-31"))];
    const julyRanges = birthdayFreeRanges(
      term,
      "a",
      birthdayWindows("1993-07-02", day("2026-06-01"), day("2026-07-31")),
      4,
    );
    const free = wearOverRanges(term, "a", julyRanges);
    expect(free.map(([a, b]) => [a.toNumber(), b.toNumber()])).toEqual([[30, 61]]);
    const wEnd = wearAdded(term, "a");
    const all = incomeBetween(p, 0, wEnd, 0, 1, free);
    const june = incomeBetween(p, 0, 30);
    expect(all.income.toString()).toBe(june.income.toString());
    expect(all.freeCost.plus(all.income).toString()).toBe(all.undiscounted.toString());
  });

  it("applies after a discount, never on top of a charge already waived", () => {
    const p = curveParams(new D(6000), 365, S);
    const { income, freeCost, discountCost, undiscounted } = incomeBetween(p, 10, 40, "0.1", 1, [
      [20, 30],
    ]);
    const freeGross = incomeBetween(p, 20, 30).undiscounted;
    expect(freeCost.toString()).toBe(freeGross.times("0.9").toString());
    expect(income.toString()).toBe(undiscounted.minus(discountCost).minus(freeCost).toString());
    // Free wear outside the item's interval is ignored.
    expect(incomeBetween(p, 10, 40, 0, 1, [[50, 60]]).freeCost.toString()).toBe("0");
    expect(incomeBetween(p, 10, 40, 0, 1, [[0, 15]]).freeCost.toString()).toBe(
      incomeBetween(p, 10, 15).undiscounted.toString(),
    );
  });
});
