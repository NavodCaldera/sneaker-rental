import "server-only";
import { randomUUID } from "node:crypto";
import type { PhotoKind } from "@/generated/prisma/client";
import { LocalDiskStorage, type Storage, storageDir } from "./local";

let instance: Storage | undefined;

export function storage(): Storage {
  instance ??= new LocalDiskStorage(storageDir());
  return instance;
}

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Listing photos are public; condition and driver photos need a signed-in user. */
export const PUBLIC_PHOTO_KINDS: PhotoKind[] = ["FRONT", "SIDE", "SOLE", "INSIDE", "BOX"];

export class PhotoError extends Error {}

export function checkPhoto(file: File, label: string) {
  if (!file || file.size === 0) throw new PhotoError(`Add the ${label} photo`);
  if (!ALLOWED_IMAGE_TYPES[file.type])
    throw new PhotoError(`${label} photo must be JPEG, PNG or WebP`);
  if (file.size > MAX_PHOTO_BYTES) throw new PhotoError(`${label} photo must be 5 MB or smaller`);
}

/** Stores an uploaded image and returns what a Photo row needs. Call checkPhoto first. */
export async function savePhoto(file: File, folder: string) {
  const ext = ALLOWED_IMAGE_TYPES[file.type];
  const storageKey = `${folder}/${randomUUID()}.${ext}`;
  await storage().put(storageKey, new Uint8Array(await file.arrayBuffer()));
  return { storageKey, contentType: file.type };
}
