import { z } from "zod";
import { STYLIST_HISTORY_MAX, STYLIST_MESSAGE_MAX } from "@/lib/stylist";
import { getCurrentUser } from "@/server/auth/session";
import { stylistAnswer } from "@/server/stylist";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(STYLIST_MESSAGE_MAX),
  history: z
    .array(
      z.object({
        sender: z.enum(["user", "stylist"]),
        text: z.string().transform((t) => t.slice(0, STYLIST_MESSAGE_MAX)),
      }),
    )
    .optional()
    .default([])
    .transform((h) => h.slice(-STYLIST_HISTORY_MAX)),
});

/**
 * The Nova Personal Stylist: POST { message, history? } → { advice, suggestedShoes, source }.
 * Open to visitors; a signed-in borrower's profile shapes the advice. Answers with the local
 * Qwen model when it is running, otherwise with the keyword rule engine.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Send a message" }, { status: 400 });
  }
  const user = await getCurrentUser();
  const { message, history } = parsed.data;
  return Response.json(await stylistAnswer(message, history, user));
}
