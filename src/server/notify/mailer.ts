/**
 * Email adapter. The app sends plain-text notices (price offers, cancelled reservations,
 * refunds, term ends) through this interface.
 *
 * OPEN DECISION: which email provider. Until then the mock below is the only
 * implementation: it logs and keeps what it "sent" in memory, for tests.
 */
export interface Mailer {
  readonly name: string;
  send(mail: Mail): Promise<{ ok: true } | { ok: false; error: string }>;
}

export type Mail = { to: string; subject: string; text: string };

export class MockMailer implements Mailer {
  readonly name = "mock";
  readonly sent: Mail[] = [];

  async send(mail: Mail) {
    this.sent.push(mail);
    if (process.env.NODE_ENV === "development") {
      console.info(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`);
    }
    return { ok: true as const };
  }
}

let instance: Mailer | undefined;

/** Tests only: swap the mailer. */
export function setMailerForTests(m: Mailer | undefined) {
  instance = m;
}

export function mailer(): Mailer {
  if (!instance) {
    const name = process.env.MAILER || "mock";
    if (name !== "mock") throw new Error(`Mailer "${name}" is not implemented yet`);
    instance = new MockMailer();
  }
  return instance;
}
