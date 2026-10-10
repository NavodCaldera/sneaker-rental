"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { DisputeError, decideDispute, decisionSchema } from "@/server/disputes";
import { PaymentError } from "@/server/payments";

export type DisputeState = { error?: string; fieldErrors?: Record<string, string[] | undefined> };

export async function decideAction(
  disputeId: string,
  _prev: DisputeState,
  formData: FormData,
): Promise<DisputeState> {
  const admin = await requireUser("ADMIN");
  const parsed = decisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  try {
    await decideDispute(admin.id, disputeId, parsed.data);
  } catch (e) {
    if (e instanceof DisputeError || e instanceof PaymentError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/disputes");
  return {};
}
