import { randomUUID } from "node:crypto";
import { D } from "@/lib/decimal";

/**
 * Payment gateway adapter. Amounts are 2-dp decimal strings in LKR; an adapter converts
 * to the gateway's minor units at its own boundary. Every call carries an idempotency key.
 *
 * Borrowers buy tokens with a plain card sale and get unused tokens back as a refund of
 * that sale, so no card holds are needed (they expire long before a 90-day rental ends).
 *
 * OPEN DECISION: which gateway (PayHere is a candidate). Until then the mock below is the
 * only implementation.
 */
export interface PaymentGateway {
  readonly name: string;
  /** Take `amount` from the borrower's card (a token top-up). */
  charge(amount: string, key: string): Promise<GatewayResult>;
  /** Give back up to the amount of an earlier charge (a token withdrawal). */
  refund(chargeRef: string, amount: string, key: string): Promise<GatewayResult>;
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

  private run(key: string, amount: string): GatewayResult {
    const prior = this.seen.get(key);
    if (prior) return prior;
    const result: GatewayResult = new D(amount).eq("13.13")
      ? { ok: false, error: "Card declined (mock)" }
      : { ok: true, ref: `mock_${randomUUID()}` };
    this.seen.set(key, result);
    return result;
  }

  async charge(amount: string, key: string) {
    return this.run(key, amount);
  }
  async refund(_chargeRef: string, amount: string, key: string) {
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
