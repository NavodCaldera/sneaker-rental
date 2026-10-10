"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PhotoKind } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/session";
import {
  CatalogueError,
  LISTING_PHOTOS,
  createShoe,
  deleteDraft,
  getMerchantForUser,
  listingLimits,
  publishShoe,
  shoeSchema,
  updatePayoutAccount,
} from "@/server/catalogue";
import { getActiveSettings } from "@/server/settings";
import { PhotoError } from "@/server/storage";

export type ActionState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

async function currentMerchant() {
  const user = await requireUser("MERCHANT");
  return getMerchantForUser(user.id);
}

export async function createShoeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const merchant = await currentMerchant();
  const limits = listingLimits(await getActiveSettings(), merchant);
  const parsed = shoeSchema(limits).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const photos: Partial<Record<PhotoKind, File>> = {};
  for (const { kind } of LISTING_PHOTOS) {
    const file = formData.get(`photo_${kind}`);
    if (file instanceof File) photos[kind] = file;
  }
  let shoeId: string;
  try {
    shoeId = (await createShoe(merchant.id, parsed.data, photos)).id;
  } catch (e) {
    if (e instanceof PhotoError || e instanceof CatalogueError) return { error: e.message };
    throw e;
  }
  redirect(`/merchant/shoes/${shoeId}`);
}

export async function publishShoeAction(shoeId: string, _prev: ActionState): Promise<ActionState> {
  const merchant = await currentMerchant();
  try {
    await publishShoe(merchant.id, shoeId);
  } catch (e) {
    if (e instanceof CatalogueError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/merchant/shoes/${shoeId}`);
  return { ok: "Published. Your shoe is now available to borrowers." };
}

export async function deleteDraftAction(shoeId: string) {
  const merchant = await currentMerchant();
  await deleteDraft(merchant.id, shoeId);
  redirect("/merchant");
}

export async function updatePayoutAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const merchant = await currentMerchant();
  try {
    await updatePayoutAccount(merchant.id, String(formData.get("payoutAccount") ?? ""));
  } catch (e) {
    if (e instanceof CatalogueError) return { error: e.message };
    throw e;
  }
  revalidatePath("/merchant");
  return { ok: "Payout account saved." };
}
