"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Grade } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/session";
import { getBundle, setBundle } from "@/server/booking/bundle";
import { BookingError, checkout, checkoutSchema } from "@/server/booking/checkout";
import { endRental, recordCondition } from "@/server/booking/lifecycle";
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

export async function endRentalAction(itemId: string) {
  const user = await requireUser("BORROWER");
  await endRental(user.id, itemId);
  revalidatePath("/rentals");
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
