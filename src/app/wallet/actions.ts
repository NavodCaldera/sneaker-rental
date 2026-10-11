"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { WalletError, topUp, withdraw } from "@/server/wallet";
import { checkWalletCover } from "@/server/wallet/cover";

export type WalletState = { error?: string; ok?: string };

/** Only same-site paths, so `next` can't send the borrower elsewhere. */
function safeNext(value: FormDataEntryValue | null) {
  const next = String(value ?? "");
  return /^\/[a-z/-]*$/.test(next) ? next : null;
}

export async function topUpAction(_prev: WalletState, formData: FormData): Promise<WalletState> {
  const user = await requireUser("BORROWER");
  try {
    await topUp(user.id, String(formData.get("amount") ?? ""), String(formData.get("key") ?? ""));
  } catch (e) {
    if (e instanceof WalletError) return { error: e.message };
    throw e;
  }
  // New tokens cover any rental that asked for a top-up.
  await checkWalletCover(new Date(), { borrowerId: user.id });
  revalidatePath("/wallet");
  const next = safeNext(formData.get("next"));
  if (next) redirect(next);
  return { ok: "Tokens added." };
}

export async function withdrawAction(_prev: WalletState, formData: FormData): Promise<WalletState> {
  const user = await requireUser("BORROWER");
  try {
    await withdraw(user.id, String(formData.get("amount") ?? ""));
  } catch (e) {
    if (e instanceof WalletError) return { error: e.message };
    throw e;
  }
  revalidatePath("/wallet");
  return { ok: "Refund sent to your card." };
}
