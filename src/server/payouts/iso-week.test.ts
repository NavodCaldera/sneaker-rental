import { describe, expect, it } from "vitest";
import { isoWeek } from "./week";

describe("isoWeek", () => {
  it("uses ISO weeks in Colombo time", () => {
    expect(isoWeek(new Date("2026-10-10T12:00:00+05:30"))).toBe("2026-W41");
    expect(isoWeek(new Date("2026-01-01T12:00:00+05:30"))).toBe("2026-W01");
    expect(isoWeek(new Date("2027-01-01T12:00:00+05:30"))).toBe("2026-W53");
    // Sunday 23:59 Colombo is still the same week; 00:01 Monday is the next.
    expect(isoWeek(new Date("2026-10-11T23:59:00+05:30"))).toBe("2026-W41");
    expect(isoWeek(new Date("2026-10-12T00:01:00+05:30"))).toBe("2026-W42");
  });
});
