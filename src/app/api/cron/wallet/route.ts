import { checkWalletCover } from "@/server/wallet/cover";

/**
 * Daily token cover check for an external scheduler: POST with
 * `Authorization: Bearer $CRON_SECRET`. Locks more tokens, requests top-ups and recalls pairs
 * whose top-up is overdue. Safe to call more than once a day.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await checkWalletCover());
}
