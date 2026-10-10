import { LogisticsError, applyTripEvent } from "@/server/logistics";
import { WebhookError, parseSignedWebhook } from "@/server/logistics/provider";

/** Trip status from a ride-hailing provider. Signed with LOGISTICS_WEBHOOK_SECRET. */
export async function POST(req: Request) {
  const raw = await req.text();
  try {
    const event = parseSignedWebhook(
      raw,
      req.headers.get("x-signature"),
      process.env.LOGISTICS_WEBHOOK_SECRET ?? "",
    );
    await applyTripEvent(event);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof WebhookError) {
      return Response.json(
        { error: e.message },
        { status: e.message === "Invalid signature" ? 401 : 400 },
      );
    }
    if (e instanceof LogisticsError) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
