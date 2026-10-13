"use server";

import { revalidatePath } from "next/cache";
import { AuthError, updateAddress, updateProfile } from "@/server/auth/service";
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

export type ProfileState = {
  ok?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

/** A customer changes who they want to become, their gender, date of birth or shoe size. */
export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireUser("BORROWER");
  const result = await updateProfile(user.id, {
    dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
    gender: String(formData.get("gender") ?? ""),
    shoeSizeSystem: String(formData.get("shoeSizeSystem") ?? ""),
    shoeSizeValue: String(formData.get("shoeSizeValue") ?? ""),
    becomingStory: String(formData.get("becomingStory") ?? ""),
  });
  if (result.errors) {
    return {
      fieldErrors: Object.fromEntries(Object.entries(result.errors).map(([k, v]) => [k, [v]])),
    };
  }
  revalidatePath("/account");
  revalidatePath("/browse");
  revalidatePath("/closet");
  return { ok: "Profile saved. Browse and your Closet now start from it." };
}
