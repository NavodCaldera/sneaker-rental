import { runPayoutBatch } from "@/server/payouts";

/**
 * Weekly payout batch for an external scheduler: POST with `Authorization: Bearer $CRON_SECRET`.
 * Safe to call more than once a week: a merchant is paid at most once per ISO week.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await runPayoutBatch());
}
