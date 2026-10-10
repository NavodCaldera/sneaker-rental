import { describe, expect, it } from "vitest";
import { WebhookError, parseSignedWebhook, signWebhook } from "./provider";

const SECRET = "test-secret";

describe("logistics webhook", () => {
  it("parses a correctly signed event", () => {
    const body = JSON.stringify({
      ref: "trip_123",
      status: "delivered",
      at: "2026-10-10T10:00:00Z",
    });
    const event = parseSignedWebhook(body, signWebhook(body, SECRET), SECRET);
    expect(event).toEqual({
      externalRef: "trip_123",
      status: "DELIVERED",
      at: new Date("2026-10-10T10:00:00Z"),
    });
  });

  it("rejects a bad or missing signature", () => {
    const body = JSON.stringify({ ref: "trip_123", status: "delivered" });
    expect(() => parseSignedWebhook(body, signWebhook(body, "other"), SECRET)).toThrow(/signature/);
    expect(() => parseSignedWebhook(body, null, SECRET)).toThrow(WebhookError);
    expect(() => parseSignedWebhook(body + " ", signWebhook(body, SECRET), SECRET)).toThrow(
      /signature/,
    );
    expect(() => parseSignedWebhook(body, signWebhook(body, SECRET), "")).toThrow(/not configured/);
  });

  it("rejects unknown statuses and malformed bodies", () => {
    const bad = (b: string) => () => parseSignedWebhook(b, signWebhook(b, SECRET), SECRET);
    expect(bad(JSON.stringify({ ref: "t", status: "teleported" }))).toThrow(/unknown status/);
    expect(bad(JSON.stringify({ status: "delivered" }))).toThrow(/Missing ref/);
    expect(bad("not json")).toThrow(/JSON/);
    expect(bad(JSON.stringify({ ref: "t", status: "booked", at: "yesterday" }))).toThrow(
      /timestamp/,
    );
  });
});
