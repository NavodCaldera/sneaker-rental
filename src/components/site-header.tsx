import { cookies } from "next/headers";
import Link from "next/link";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { ThemeToggle } from "./theme-toggle";
import { getCurrentUser } from "@/server/auth/session";
import { signOutAction } from "@/server/auth/actions";
import { unreadCount } from "@/server/notify";
import type { Role } from "@/generated/prisma/client";

const NAV: Record<Role, { href: string; label: string }[]> = {
  BORROWER: [
    { href: "/browse", label: "Browse" },
    { href: "/closet", label: "My closet" },
    { href: "/bundle", label: "Bundle" },
    { href: "/rentals", label: "My rentals" },
    { href: "/wallet", label: "Wallet" },
    { href: "/account", label: "Account" },
  ],
  MERCHANT: [
    { href: "/merchant", label: "My shoes" },
    { href: "/merchant/shoes/new", label: "Add shoe" },
    { href: "/merchant/packs", label: "Style packs" },
    { href: "/merchant/returns", label: "Returns" },
    { href: "/merchant/payouts", label: "Payouts" },
    { href: "/merchant/account", label: "Account" },
  ],
  ADMIN: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/deliveries", label: "Deliveries" },
    { href: "/admin/disputes", label: "Disputes" },
    { href: "/admin/payouts", label: "Payouts" },
    { href: "/admin/packs", label: "Style packs" },
    { href: "/admin/merchants", label: "Merchants" },
    { href: "/admin/settings", label: "Settings" },
  ],
};

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(user.id) : 0;
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4">
        <Link
          href="/"
          className="text-2xl font-extrabold tracking-tight text-accent hover:opacity-90 transition-opacity"
        >
          Nova
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
              <ThemeToggle initial={theme} />
            </div>
          </>
        ) : (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Link
              href="/closet"
              className="hidden rounded-full border border-line px-4 py-2 font-medium text-ink shadow-sm sm:inline-block hover:border-ink hover:bg-muted transition-all"
            >
              Build Your Nova Closet
            </Link>
            <Link
              href="/sign-in"
              className="whitespace-nowrap rounded-full bg-accent px-4 py-2 font-medium text-on-accent hover:opacity-90 transition-opacity"
            >
              Sign in / Sign up
            </Link>
            <ThemeToggle initial={theme} />
          </div>
        )}
      </div>
    </header>
  );
}
