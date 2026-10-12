"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Grade } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/session";
import { getBundle, setBundle } from "@/server/booking/bundle";
import { BookingError, checkout, checkoutSchema } from "@/server/booking/checkout";
import {
  earlyReturnSchema,
  endRental,
  extendRental,
  extendSchema,
  recordCondition,
  scheduleEarlyReturn,
} from "@/server/booking/lifecycle";
import { acceptOffer, rejectOffer } from "@/server/booking/reservations";
import { PhotoError } from "@/server/storage";

export type ActionState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export async function addToBundleAction(shoeId: string) {
  await requireUser("BORROWER");
  await setBundle([...(await getBundle()), shoeId]);
  redirect("/bundle");
}

/** Adds a rotation planned in the closet to the bundle, keeping the pairs already in it. */
export async function addRotationToBundleAction(shoeIds: string[]) {
  await requireUser("BORROWER");
  const ids = Array.isArray(shoeIds) ? shoeIds.filter((id) => typeof id === "string") : [];
  await setBundle([...(await getBundle()), ...ids]);
  redirect("/bundle");
}

export async function removeFromBundleAction(shoeId: string) {
  await requireUser("BORROWER");
  await setBundle((await getBundle()).filter((id) => id !== shoeId));
  revalidatePath("/bundle");
}

export async function checkoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("BORROWER");
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await checkout(user.id, await getBundle(), parsed.data);
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  await setBundle([]);
  redirect("/rentals?booked=1");
}

export async function endRentalAction(itemId: string, _prev: ActionState): Promise<ActionState> {
  const user = await requireUser("BORROWER");
  try {
    await endRental(user.id, itemId);
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  revalidatePath("/rentals");
  return { ok: "Rental ended. Your rent is charged for the days you kept it once it's back." };
}

export async function earlyReturnAction(
  itemId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser("BORROWER");
  const parsed = earlyReturnSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await scheduleEarlyReturn(user.id, itemId, parsed.data.lastDay);
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  revalidatePath("/rentals");
  return { ok: "Early return booked. The rent estimate for the unused days is unlocked." };
}

export async function extendRentalAction(
  itemId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser("BORROWER");
  const parsed = extendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await extendRental(user.id, itemId, parsed.data.days);
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  revalidatePath("/rentals");
  return { ok: `Extended by ${parsed.data.days} days.` };
}

export async function answerOfferAction(
  itemId: string,
  answer: "accept" | "reject",
  _prev: ActionState,
): Promise<ActionState> {
  const user = await requireUser("BORROWER");
  try {
    if (answer === "accept") await acceptOffer(user.id, itemId);
    else await rejectOffer(user.id, itemId);
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  revalidatePath("/rentals");
  return {
    ok:
      answer === "accept"
        ? "Accepted. A driver brings the pair to you as soon as it's handed back."
        : "Reservation cancelled. Your deposit and rent estimate are unlocked.",
  };
}

const GRADES: Grade[] = ["A", "B", "C", "D"];

/** Shared by borrowers (receipt / handoff) and merchants (returns). */
export async function recordConditionAction(
  itemId: string,
  redirectTo: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser("BORROWER", "MERCHANT");
  const grade = String(formData.get("grade") ?? "") as Grade;
  if (!GRADES.includes(grade)) return { fieldErrors: { grade: ["Choose a grade"] } };
  const photos = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  try {
    await recordCondition(user.id, {
      itemId,
      grade,
      notes: String(formData.get("notes") ?? "").trim() || undefined,
      damageFlag: formData.get("damageFlag") === "on",
      photos,
    });
  } catch (e) {
    if (e instanceof BookingError || e instanceof PhotoError) return { error: e.message };
    throw e;
  }
  redirect(redirectTo);
}
