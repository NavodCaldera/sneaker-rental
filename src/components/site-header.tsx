import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { signOutAction } from "@/server/auth/actions";
import { unreadCount } from "@/server/notify";
import type { Role } from "@/generated/prisma/client";

const NAV: Record<Role, { href: string; label: string }[]> = {
  BORROWER: [
    { href: "/browse", label: "Browse" },
    { href: "/bundle", label: "Bundle" },
    { href: "/rentals", label: "My rentals" },
    { href: "/wallet", label: "Wallet" },
  ],
  MERCHANT: [
    { href: "/merchant", label: "My shoes" },
    { href: "/merchant/shoes/new", label: "Add shoe" },
    { href: "/merchant/returns", label: "Returns" },
    { href: "/merchant/payouts", label: "Payouts" },
    { href: "/merchant/account", label: "Account" },
  ],
  ADMIN: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/deliveries", label: "Deliveries" },
    { href: "/admin/disputes", label: "Disputes" },
    { href: "/admin/payouts", label: "Payouts" },
    { href: "/admin/merchants", label: "Merchants" },
    { href: "/admin/settings", label: "Settings" },
  ],
};

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(user.id) : 0;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xl font-bold tracking-tight text-accent"
        >
          <span aria-hidden="true">👟</span> Sneaker Rental
        </Link>
        {user ? (
          <>
            <nav className="flex flex-wrap gap-1 text-sm" aria-label="Main">
              {NAV[user.role].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full px-3 py-1.5 font-medium hover:bg-muted"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <Link
                href="/notifications"
                className="rounded-full px-3 py-1.5 font-medium hover:bg-muted"
              >
                Notices{unread > 0 && <span className="ml-1 font-semibold">({unread})</span>}
              </Link>
              <span className="hidden text-subtle sm:inline">{user.name}</span>
              <form action={signOutAction}>
                <button className="rounded-full border border-line px-3 py-1.5 font-medium shadow-sm hover:shadow">
                  Sign out
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="ml-auto flex items-center gap-1 text-sm">
            <Link href="/browse" className="rounded-full px-3 py-2 font-medium hover:bg-muted">
              Browse
            </Link>
            <Link
              href="/sign-in"
              className="rounded-full border border-line px-4 py-2 font-medium shadow-sm hover:shadow"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full bg-ink px-4 py-2 font-medium text-paper hover:opacity-90"
            >
              Sign up
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
