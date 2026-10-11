import { runDailyRentals } from "@/server/booking/daily";

/**
 * Daily rental job for an external scheduler: POST with `Authorization: Bearer $CRON_SECRET`.
 * Ends terms that have run out (a driver collects the pairs), expires unanswered price
 * offers and sends queued emails. Safe to call more than once a day.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await runDailyRentals());
}
