import { describe, expect, it } from "vitest";
import { toD } from "./decimal";
import { formatDate, formatDateTime, formatLKR, formatPercent, formatWear } from "./format";

const NBSP = " ";

describe("format", () => {
  it("formats LKR exactly, rounding half up to 2 dp", () => {
    expect(formatLKR("2866.1142780659993")).toBe(`LKR${NBSP}2,866.11`);
    expect(formatLKR("28.9248")).toBe(`LKR${NBSP}28.92`);
    expect(formatLKR("0.005")).toBe(`LKR${NBSP}0.01`);
    expect(formatLKR("12345678901234.995")).toBe(`LKR${NBSP}12,345,678,901,235.00`);
  });

  it("formats wear to at most 2 dp", () => {
    expect(formatWear("2.5")).toBe("2.5");
    expect(formatPercent("0.005")).toBe("0.5%");
    expect(formatPercent("0.1")).toBe("10%");
    expect(formatWear("12.3456")).toBe("12.35");
    expect(formatWear("365")).toBe("365");
  });

  it("formats dates in Colombo time", () => {
    expect(formatDate(new Date("2026-10-10T20:00:00Z"))).toBe("11 Oct 2026");
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime("2026-10-10T04:30:00Z")).toMatch(/10 Oct.*10:00/);
    expect(formatDateTime(undefined)).toBe("—");
  });

  it("converts stored decimals without a float round trip", () => {
    expect(toD({ toString: () => "0.1000000000000000055511151231257827" }).toString()).toBe(
      "0.1000000000000000055511151231257827",
    );
  });
});
