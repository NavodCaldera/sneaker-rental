import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { userNotifications } from "@/server/notify";
import { markAllReadAction } from "./actions";

export const metadata: Metadata = { title: "Notices" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const notices = await userNotifications(user.id);
  const unread = notices.some((n) => !n.readAt);

  return (
    <main>
      <PageHeader title="Notices" />
      {notices.length === 0 ? (
        <EmptyState title="Nothing new" />
      ) : (
        <div className="flex flex-col gap-3">
          {unread && (
            <form action={markAllReadAction}>
              <Button type="submit" variant="secondary">
                Mark all as read
              </Button>
            </form>
          )}
          <ul className="flex flex-col gap-3">
            {notices.map((n) => (
              <li key={n.id}>
                <Card className="flex flex-col gap-1 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{n.title}</span>
                    {!n.readAt && <Badge tone="info">New</Badge>}
                    <span className="ml-auto text-xs text-subtle">
                      {formatDateTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-subtle">{n.body}</p>
                  {n.link && (
                    <Link href={n.link} className="underline">
                      Open
                    </Link>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
