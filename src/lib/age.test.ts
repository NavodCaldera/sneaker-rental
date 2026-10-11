import { describe, expect, it } from "vitest";
import { ageOn, colomboToday, isCalendarDate } from "./age";

describe("age", () => {
  it("counts whole years, turning over on the birthday", () => {
    expect(ageOn("2000-10-12", "2026-10-11")).toBe(25);
    expect(ageOn("2000-10-11", "2026-10-11")).toBe(26);
    expect(ageOn("2000-02-29", "2026-02-28")).toBe(25);
    expect(ageOn("2000-02-29", "2026-03-01")).toBe(26);
  });

  it("accepts only real calendar dates", () => {
    expect(isCalendarDate("2000-02-29")).toBe(true);
    expect(isCalendarDate("2001-02-29")).toBe(false);
    expect(isCalendarDate("2000-13-01")).toBe(false);
    expect(isCalendarDate("01/02/2000")).toBe(false);
  });

  it("uses the Colombo date", () => {
    // 20:00 UTC on 10 Oct is 01:30 on 11 Oct in Colombo.
    expect(colomboToday(new Date("2026-10-10T20:00:00Z"))).toBe("2026-10-11");
  });
});
