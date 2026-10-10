"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { settingsSchema, updateSettings } from "@/server/settings";

export type SettingsState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export async function saveSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireUser("ADMIN");
  const parsed = settingsSchema.safeParse({
    ...Object.fromEntries(formData),
    catchUpEnabled: formData.get("catchUpEnabled") === "on",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  await updateSettings(parsed.data, admin.id);
  revalidatePath("/admin/settings");
  return { ok: "Saved. The new version is active now." };
}
