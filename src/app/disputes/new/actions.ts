"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { DisputeError, openDispute } from "@/server/disputes";

export type OpenDisputeState = { error?: string };

export async function openDisputeAction(
  itemId: string,
  back: string,
  _prev: OpenDisputeState,
  formData: FormData,
): Promise<OpenDisputeState> {
  const user = await requireUser("BORROWER", "MERCHANT");
  try {
    await openDispute(user.id, itemId, String(formData.get("reason") ?? ""));
  } catch (e) {
    if (e instanceof DisputeError) return { error: e.message };
    throw e;
  }
  // Same-site paths only (no "//host" open redirects).
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}
