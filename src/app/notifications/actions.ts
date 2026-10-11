"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { markAllRead } from "@/server/notify";

export async function markAllReadAction() {
  const user = await requireUser();
  await markAllRead(user.id);
  revalidatePath("/", "layout");
}
