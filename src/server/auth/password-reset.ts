import "server-only";
import { z } from "zod";
import { db } from "../db";
import { appUrl } from "../notify";
import { mailer } from "../notify/mailer";
import { hashPassword } from "./password";
import { AuthError, hashToken, newToken } from "./service";

/** A reset link works once, for this long. */
export const RESET_TTL_MINUTES = 60;
/** One email per account in this window, so the form can't be used to flood an inbox. */
const RESEND_AFTER_SECONDS = 60;

export const newPasswordSchema = z.string().min(8, "Use at least 8 characters");

/**
 * "Forgot password": emails the account a link to choose a new password. Says nothing about
 * whether the email has an account (the page shows the same message either way); returns the
 * link only so tests and the development page can follow it.
 */
export async function requestPasswordReset(
  email: string,
  now = new Date(),
): Promise<{ link: string } | null> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return null;
  const recent = await db.passwordReset.findFirst({
    where: {
      userId: user.id,
      createdAt: { gt: new Date(now.getTime() - RESEND_AFTER_SECONDS * 1000) },
    },
  });
  if (recent) return null;

  const token = newToken();
  await db.passwordReset.create({
    data: {
      id: hashToken(token),
      userId: user.id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + RESET_TTL_MINUTES * 60_000),
    },
  });
  const link = `${appUrl()}/reset-password?token=${token}`;
  await mailer().send({
    to: user.email,
    subject: "Reset your Nova password",
    text:
      `Hi ${user.name},\n\nSomeone asked to reset the password for your Nova account. ` +
      `Open this link within ${RESET_TTL_MINUTES} minutes to choose a new one:\n\n${link}\n\n` +
      `If it wasn't you, ignore this email: your password stays the same.`,
  });
  return { link };
}

/** The reset a link belongs to, if it can still be used. */
async function usableReset(token: string, now: Date) {
  const reset = await db.passwordReset.findUnique({ where: { id: hashToken(token) } });
  return reset && !reset.usedAt && reset.expiresAt > now ? reset : null;
}

export async function resetLinkWorks(token: string, now = new Date()) {
  return !!token && !!(await usableReset(token, now));
}

/**
 * Sets the new password from a reset link. The link and any other open links for the account
 * stop working, and every session is signed out (whoever knew the old password is logged out).
 */
export async function resetPassword(token: string, password: string, now = new Date()) {
  const parsed = newPasswordSchema.safeParse(password);
  if (!parsed.success) throw new AuthError(parsed.error.issues[0].message);
  const reset = token ? await usableReset(token, now) : null;
  if (!reset) throw new AuthError("This link has expired or was already used. Ask for a new one.");
  const passwordHash = await hashPassword(parsed.data);
  return db.$transaction(async (tx) => {
    // Claim the link first, so two submits can't both use it.
    const claimed = await tx.passwordReset.updateMany({
      where: { id: reset.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count === 0) {
      throw new AuthError("This link has expired or was already used. Ask for a new one.");
    }
    await tx.passwordReset.updateMany({
      where: { userId: reset.userId, usedAt: null },
      data: { usedAt: now },
    });
    await tx.session.deleteMany({ where: { userId: reset.userId } });
    return tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
  });
}
