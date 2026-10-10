import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeliveryStatus, DeliveryType } from "@/generated/prisma/client";

/**
 * Ride-hailing provider adapter. OPEN DECISION: which app to integrate first and whether
 * it has a delivery API. Until then the manual provider is the only implementation: an
 * admin gets the quote and books the trip by hand, and drivers update status through the
 * courier link.
 */
export interface LogisticsProvider {
  readonly name: string;
  /** null when the provider can't quote automatically (manual: the admin enters it). */
  quote(from: string, to: string, type: DeliveryType): Promise<string | null>;
  /** Books the trip; returns the provider's reference, if any. */
  book(input: {
    deliveryId: string;
    from: string;
    to: string;
    type: DeliveryType;
  }): Promise<{ externalRef: string | null }>;
}

export class ManualProvider implements LogisticsProvider {
  readonly name = "manual";
  async quote() {
    return null;
  }
  async book() {
    return { externalRef: null };
  }
}

export function provider(): LogisticsProvider {
  const name = process.env.LOGISTICS_PROVIDER || "manual";
  if (name !== "manual") throw new Error(`Logistics provider "${name}" is not implemented yet`);
  return new ManualProvider();
}

// ─── Webhooks ──────────────────────────────────────────────────────────────

export type TripEvent = { externalRef: string; status: DeliveryStatus; at: Date };

const STATUS_MAP: Record<string, DeliveryStatus> = {
  booked: "BOOKED",
  picked_up: "PICKED_UP",
  delivered: "DELIVERED",
  cancelled: "CANCELLED",
  failed: "FAILED",
};

/**
 * Verifies and parses a provider webhook: body `{ ref, status, at }`, signed with
 * HMAC-SHA256 of the raw body in the `x-signature` header (hex). Providers that sign
 * differently get their own parser; the normalised TripEvent stays the same.
 */
export function parseSignedWebhook(
  rawBody: string,
  signature: string | null,
  secret: string,
): TripEvent {
  if (!secret) throw new WebhookError("Webhook secret is not configured");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(signature ?? "", "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new WebhookError("Invalid signature");
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new WebhookError("Body is not JSON");
  }
  const { ref, status, at } = (body ?? {}) as Record<string, unknown>;
  const mapped = typeof status === "string" ? STATUS_MAP[status] : undefined;
  if (typeof ref !== "string" || !ref || !mapped)
    throw new WebhookError("Missing ref or unknown status");
  const when = typeof at === "string" ? new Date(at) : new Date();
  if (Number.isNaN(when.getTime())) throw new WebhookError("Invalid timestamp");
  return { externalRef: ref, status: mapped, at: when };
}

export class WebhookError extends Error {}

export function signWebhook(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}
