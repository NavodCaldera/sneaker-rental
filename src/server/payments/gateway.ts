import { randomUUID } from "node:crypto";
import { D } from "@/lib/decimal";

/**
 * Payment gateway adapter. Amounts are 2-dp decimal strings in LKR; an adapter converts
 * to the gateway's minor units at its own boundary. Every call carries an idempotency key.
 *
 * OPEN DECISION: which gateway (PayHere is a candidate; confirm card pre-authorisation).
 * Until then the mock below is the only implementation.
 */
export interface PaymentGateway {
  readonly name: string;
  /** Hold `amount` on the card for a later capture. */
  preAuthorise(amount: string, key: string): Promise<GatewayResult>;
  /** Take money against an authorisation (may be called several times, one per item). */
  capture(authRef: string, amount: string, key: string): Promise<GatewayResult>;
  /** Release what's left of an authorisation. */
  void(authRef: string, key: string): Promise<GatewayResult>;
  refund(captureRef: string, amount: string, key: string): Promise<GatewayResult>;
}

export type GatewayResult = { ok: true; ref: string } | { ok: false; error: string };

/** LKR minor units (cents) as an integer string, e.g. "2866.11" → "286611". */
export function toMinorUnits(amount: string): string {
  return new D(amount).times(100).toFixed(0);
}

/**
 * In-process mock. Succeeds unless the amount is exactly 13.13 LKR (a test "decline"), and
 * replays the same result for a repeated idempotency key.
 */
export class MockGateway implements PaymentGateway {
  readonly name = "mock";
  private readonly seen = new Map<string, GatewayResult>();

  private run(key: string, amount: string | null): GatewayResult {
    const prior = this.seen.get(key);
    if (prior) return prior;
    const result: GatewayResult =
      amount !== null && new D(amount).eq("13.13")
        ? { ok: false, error: "Card declined (mock)" }
        : { ok: true, ref: `mock_${randomUUID()}` };
    this.seen.set(key, result);
    return result;
  }

  async preAuthorise(amount: string, key: string) {
    return this.run(key, amount);
  }
  async capture(_authRef: string, amount: string, key: string) {
    return this.run(key, amount);
  }
  async void(_authRef: string, key: string) {
    return this.run(key, null);
  }
  async refund(_captureRef: string, amount: string, key: string) {
    return this.run(key, amount);
  }
}

let instance: PaymentGateway | undefined;

/** Tests only: swap the gateway (e.g. one that declines). */
export function setGatewayForTests(g: PaymentGateway | undefined) {
  instance = g;
}

export function gateway(): PaymentGateway {
  if (!instance) {
    const name = process.env.PAYMENT_GATEWAY || "mock";
    if (name !== "mock") throw new Error(`Payment gateway "${name}" is not implemented yet`);
    instance = new MockGateway();
  }
  return instance;
}
