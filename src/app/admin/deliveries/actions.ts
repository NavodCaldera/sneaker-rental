"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { DeliveryStatus } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/session";
import {
  LogisticsError,
  bookDelivery,
  renewCourierLink,
  setQuote,
  updateStatus,
} from "@/server/logistics";

export type DeliveryActionState = { error?: string; courierLink?: string };

async function linkFor(token: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/courier/${token}`;
}

export async function quoteAction(
  deliveryId: string,
  _prev: DeliveryActionState,
  formData: FormData,
): Promise<DeliveryActionState> {
  const admin = await requireUser("ADMIN");
  try {
    await setQuote(deliveryId, String(formData.get("quote") ?? ""), admin.name);
  } catch (e) {
    if (e instanceof LogisticsError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/deliveries");
  return {};
}

export async function bookAction(
  deliveryId: string,
  _prev: DeliveryActionState,
): Promise<DeliveryActionState> {
  const admin = await requireUser("ADMIN");
  try {
    const token = await bookDelivery(deliveryId, admin.name);
    revalidatePath("/admin/deliveries");
    return { courierLink: await linkFor(token) };
  } catch (e) {
    if (e instanceof LogisticsError) return { error: e.message };
    throw e;
  }
}

export async function renewLinkAction(
  deliveryId: string,
  _prev: DeliveryActionState,
): Promise<DeliveryActionState> {
  await requireUser("ADMIN");
  try {
    return { courierLink: await linkFor(await renewCourierLink(deliveryId)) };
  } catch (e) {
    if (e instanceof LogisticsError) return { error: e.message };
    throw e;
  }
}

/** Manual fallback: the admin moves the trip along when the driver can't use the link. */
export async function statusAction(
  deliveryId: string,
  status: DeliveryStatus,
  _prev: DeliveryActionState,
): Promise<DeliveryActionState> {
  const admin = await requireUser("ADMIN");
  try {
    await updateStatus(deliveryId, status, admin.name);
  } catch (e) {
    if (e instanceof LogisticsError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/deliveries");
  return {};
}
