import type Decimal from "decimal.js";
import { D, roundMoney } from "./decimal";

const lkr = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  currencyDisplay: "code",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Display an amount in LKR, rounded to 2 dp. Formatting is exact: the string never becomes a float. */
export function formatLKR(value: Decimal.Value): string {
  return lkr.format(roundMoney(value).toFixed(2) as unknown as number);
}

const tokens = new Intl.NumberFormat("en-LK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Display a token amount (1 token = 1 LKR), rounded to 2 dp, e.g. "12,600.00 tokens". */
export function formatTokens(value: Decimal.Value): string {
  return `${tokens.format(roundMoney(value).toFixed(2) as unknown as number)} tokens`;
}

/** Display a ratio as a percentage to at most 2 dp, e.g. 0.005 → "0.5%". */
export function formatPercent(ratio: Decimal.Value): string {
  return `${new D(ratio).times(100).toDecimalPlaces(2).toString()}%`;
}

/** Display wear-days to at most 2 dp, e.g. "12.5". */
export function formatWear(value: Decimal.Value): string {
  return new D(value).toDecimalPlaces(2).toString();
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Colombo",
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  }).format(new Date(date));
}
