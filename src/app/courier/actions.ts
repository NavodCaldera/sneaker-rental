"use server";

import { revalidatePath } from "next/cache";
import { LogisticsError, courierDropoff, courierPickup } from "@/server/logistics";
import { PhotoError } from "@/server/storage";

export type CourierState = { error?: string };

function photoFrom(formData: FormData) {
  const file = formData.get("photo");
  return file instanceof File ? file : new File([], "missing");
}

export async function pickupAction(
  token: string,
  _prev: CourierState,
  formData: FormData,
): Promise<CourierState> {
  try {
    await courierPickup(token, {
      photo: photoFrom(formData),
      sealedBag: formData.get("sealedBag") === "on",
      cleaningKit: formData.get("cleaningKit") === "on",
    });
  } catch (e) {
    if (e instanceof LogisticsError || e instanceof PhotoError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/courier/${token}`);
  return {};
}

export async function dropoffAction(
  token: string,
  _prev: CourierState,
  formData: FormData,
): Promise<CourierState> {
  try {
    await courierDropoff(token, { photo: photoFrom(formData) });
  } catch (e) {
    if (e instanceof LogisticsError || e instanceof PhotoError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/courier/${token}`);
  return {};
}
