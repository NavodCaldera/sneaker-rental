"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getBundle, setBundle } from "@/server/booking/bundle";
import {
  PackError,
  createPack,
  deletePack,
  packBundlePicks,
  parsePackForm,
  publishPack,
  rejectPack,
  submitPack,
  unpublishPack,
  updatePack,
  withdrawPack,
} from "@/server/packs";

export type PackActionState = {
  error?: string;
  ok?: string;
  /** Problems by field path: "title", "roles", "roles.0.shoeIds" */
  issues?: Record<string, string>;
};

/** Where a user manages packs. */
function base(role: "MERCHANT" | "ADMIN") {
  return role === "ADMIN" ? "/admin/packs" : "/merchant/packs";
}

async function maker() {
  const user = await requireUser("MERCHANT", "ADMIN");
  return { user, base: base(user.role as "MERCHANT" | "ADMIN") };
}

function refresh(path: string, packId?: string) {
  revalidatePath(path);
  if (packId) revalidatePath(`${path}/${packId}`);
  revalidatePath("/");
  if (packId) revalidatePath(`/packs/${packId}`);
}

async function attempt(fn: () => Promise<unknown>, ok: string): Promise<PackActionState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof PackError) return { error: e.message };
    throw e;
  }
  return { ok };
}

/**
 * Create (packId null) or save a pack from the editor. An admin's "Save and publish" sends
 * intent=publish.
 */
export async function savePackAction(
  packId: string | null,
  _prev: PackActionState,
  formData: FormData,
): Promise<PackActionState> {
  const { user, base } = await maker();
  const parsed = parsePackForm(formData);
  if (!parsed.success) {
    const issues: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      issues[key] ??= issue.message;
    }
    return { issues, error: "Check the highlighted fields" };
  }
  let id = packId;
  try {
    if (id) await updatePack(user, id, parsed.data);
    else {
      const publish = formData.get("intent") === "publish";
      id = (await createPack(user, parsed.data, { publish })).id;
    }
  } catch (e) {
    if (e instanceof PackError) return { error: e.message };
    throw e;
  }
  refresh(base, id);
  if (!packId) redirect(`${base}/${id}`);
  return { ok: "Saved." };
}

export async function submitPackAction(packId: string): Promise<PackActionState> {
  const { user, base } = await maker();
  const result = await attempt(() => submitPack(user, packId), "Sent for review.");
  refresh(base, packId);
  return result;
}

export async function withdrawPackAction(packId: string): Promise<PackActionState> {
  const { user, base } = await maker();
  const result = await attempt(() => withdrawPack(user, packId), "Back to a draft.");
  refresh(base, packId);
  return result;
}

export async function publishPackAction(packId: string): Promise<PackActionState> {
  const user = await requireUser("ADMIN");
  const result = await attempt(() => publishPack(user, packId), "Published.");
  refresh("/admin/packs", packId);
  return result;
}

export async function rejectPackAction(
  packId: string,
  _prev: PackActionState,
  formData: FormData,
): Promise<PackActionState> {
  const user = await requireUser("ADMIN");
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 3) return { issues: { note: "Say what the merchant should change" } };
  const result = await attempt(() => rejectPack(user, packId, note), "Sent back to the merchant.");
  refresh("/admin/packs", packId);
  return result;
}

export async function unpublishPackAction(
  packId: string,
  _prev: PackActionState,
  formData: FormData,
): Promise<PackActionState> {
  const user = await requireUser("ADMIN");
  const result = await attempt(
    () => unpublishPack(user, packId, String(formData.get("note") ?? "")),
    "Taken off the site.",
  );
  refresh("/admin/packs", packId);
  return result;
}

export async function deletePackAction(packId: string): Promise<PackActionState> {
  const { user, base } = await maker();
  const result = await attempt(() => deletePack(user, packId), "Deleted.");
  if (result.error) return result;
  refresh(base);
  redirect(base);
}

/** A borrower puts one bookable pair from each role of a pack into their bundle. */
export async function addPackToBundleAction(packId: string) {
  await requireUser("BORROWER");
  const picks = await packBundlePicks(packId);
  await setBundle([...new Set([...(await getBundle()), ...picks])]);
  redirect("/bundle");
}
