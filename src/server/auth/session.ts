import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/generated/prisma/client";
import { RETURNING_COOKIE } from "@/lib/intro";
import { type SessionUser, endSession, homeFor, startSession, userForToken } from "./service";

const COOKIE = "sr_session";

export async function signInAs(userId: string) {
  const { token, expiresAt } = await startSession(userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  // Remember that this browser has signed in, so it never sees the first-visit welcome.
  (await cookies()).set(RETURNING_COOKIE, "1", {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 2,
  });
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await endSession(token);
  jar.delete(COOKIE);
}

/** The signed-in user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? userForToken(token) : null;
});

/**
 * Data-access-layer guard: call at the top of every page, server action and route handler
 * that needs a signed-in user. Redirects instead of returning when the check fails.
 */
export async function requireUser(...roles: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (roles.length > 0 && !roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}
