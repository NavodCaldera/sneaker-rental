"use server";

import { revalidatePath } from "next/cache";
import { AuthError, updateAddress } from "@/server/auth/service";
import { requireUser } from "@/server/auth/session";

export type AddressState = { error?: string; ok?: string };

/** Customers and merchants change their one address. */
export async function updateAddressAction(
  _prev: AddressState,
  formData: FormData,
): Promise<AddressState> {
  const user = await requireUser("BORROWER", "MERCHANT");
  try {
    await updateAddress(
      user.id,
      String(formData.get("address") ?? ""),
      String(formData.get("city") ?? ""),
    );
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  revalidatePath("/account");
  revalidatePath("/merchant/account");
  revalidatePath("/bundle");
  return { ok: "Address saved. Trips booked from now on use it." };
}
