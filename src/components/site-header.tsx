import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { signOutAction } from "@/server/auth/actions";
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
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          <span className="text-accent">●</span> Sneaker Rental
        </Link>
        {user ? (
          <>
            <nav className="flex flex-wrap gap-1 text-sm" aria-label="Main">
              {NAV[user.role].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-2 py-1 hover:bg-muted"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="hidden text-subtle sm:inline">{user.name}</span>
              <form action={signOutAction}>
                <button className="rounded-md px-2 py-1 hover:bg-muted">Sign out</button>
              </form>
            </div>
          </>
        ) : (
          <div className="ml-auto flex gap-2 text-sm">
            <Link href="/browse" className="rounded-md px-2 py-1 hover:bg-muted">
              Browse
            </Link>
            <Link href="/sign-in" className="rounded-md px-2 py-1 hover:bg-muted">
              Sign in
            </Link>
            <Link href="/sign-up" className="rounded-md bg-ink px-3 py-1 text-paper">
              Sign up
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
