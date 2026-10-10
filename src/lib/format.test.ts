import { describe, expect, it } from "vitest";
import { formatLKR, formatWear } from "./format";

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
    expect(formatWear("12.3456")).toBe("12.35");
    expect(formatWear("365")).toBe("365");
  });
});
