"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { CatalogueError, setLifespanExtension } from "@/server/catalogue";

export type LifespanState = { error?: string; ok?: string };

/** Grant a merchant a longer maximum lifespan (in months), or remove it when left empty. */
export async function saveLifespanExtensionAction(
  merchantId: string,
  _prev: LifespanState,
  formData: FormData,
): Promise<LifespanState> {
  await requireUser("ADMIN");
  const raw = String(formData.get("months") ?? "").trim();
  if (raw && !/^\d+$/.test(raw)) return { error: "Enter whole months" };
  try {
    await setLifespanExtension(merchantId, raw ? Number(raw) : null);
  } catch (e) {
    if (e instanceof CatalogueError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/merchants");
  return { ok: raw ? `Extended to ${raw} months` : "Back to the standard limit" };
}
