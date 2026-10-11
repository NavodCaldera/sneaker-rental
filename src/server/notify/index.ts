import "server-only";
import type { NotificationKind } from "@/generated/prisma/client";
import { type Tx, db } from "../db";
import { mailer } from "./mailer";

/**
 * In-app notices, also sent by email. `notify` writes the notice inside the caller's
 * transaction (so it exists only if the change it describes does); `flushEmails` sends the
 * ones not emailed yet, after the transaction. The daily job flushes anything left over.
 */
export async function notify(
  tx: Tx,
  input: {
    userId: string;
    kind: NotificationKind;
    title: string;
    body: string;
    link?: string;
    rentalItemId?: string;
  },
) {
  return tx.notification.create({ data: input });
}

/** Send every notice not emailed yet. Failed sends stay queued for the next flush. */
export async function flushEmails(now = new Date()) {
  const pending = await db.notification.findMany({
    where: { emailedAt: null },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  let sent = 0;
  for (const n of pending) {
    const text = n.link ? `${n.body}\n\n${appUrl()}${n.link}` : n.body;
    const result = await mailer().send({ to: n.user.email, subject: n.title, text });
    if (!result.ok) continue;
    await db.notification.update({ where: { id: n.id }, data: { emailedAt: now } });
    sent += 1;
  }
  return sent;
}

export function appUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export async function userNotifications(userId: string, take = 30) {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function markAllRead(userId: string, now = new Date()) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: now } });
}
