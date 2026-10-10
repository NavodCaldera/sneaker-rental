import "server-only";
import { cookies } from "next/headers";

/** The borrower's bundle before checkout: shoe ids in a cookie. Capped by the bundle size. */
const COOKIE = "sr_bundle";
const MAX_IDS = 10;

export async function getBundle(): Promise<string[]> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids)
      ? ids.filter((x): x is string => typeof x === "string").slice(0, MAX_IDS)
      : [];
  } catch {
    return [];
  }
}

export async function setBundle(ids: string[]) {
  const jar = await cookies();
  const unique = [...new Set(ids)].slice(0, MAX_IDS);
  if (unique.length === 0) jar.delete(COOKIE);
  else
    jar.set(COOKIE, JSON.stringify(unique), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
}
