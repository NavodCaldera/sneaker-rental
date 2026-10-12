"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { cx } from "./ui";

// Set once the visitor has moved between pages of this site in this tab, so "Back" can
// return to the page they came from instead of leaving the site.
let movedInApp = false;
let firstPath: string | null = null;

/** Mounted once in the root layout: notices in-app page changes for `BackButton`. */
export function NavTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (firstPath === null) firstPath = pathname;
    else if (pathname !== firstPath) movedInApp = true;
  }, [pathname]);
  return null;
}

/**
 * A "Back" link at the top of a sub-page. It goes to `href` (the parent page); with
 * `useHistory`, it returns to the previous page instead when the visitor got here from
 * another page of the site (e.g. a filtered Browse or a style pack), falling back to `href`.
 */
export function BackButton({
  href,
  to,
  useHistory = false,
  className,
}: {
  href: string;
  /** Where `href` leads, for the hover hint ("Back to …"). */
  to: string;
  useHistory?: boolean;
  className?: string;
}) {
  const router = useRouter();
  return (
    <Link
      href={href}
      title={`Back to ${to}`}
      onClick={(e) => {
        if (!useHistory || !movedInApp) return;
        e.preventDefault();
        router.back();
      }}
      className={cx(
        "flex w-fit items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-medium shadow-sm hover:shadow",
        className,
      )}
    >
      <span aria-hidden="true">←</span> Back
    </Link>
  );
}
