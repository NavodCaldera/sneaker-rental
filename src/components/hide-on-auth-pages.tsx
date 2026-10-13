"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Pages where a visitor is signing in or up: on small screens the site header is hidden there. */
const AUTH_PATHS = ["/sign-in", "/sign-up"];

export function HideOnAuthPages({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // `contents` keeps the header's sticky positioning relative to the page, not a wrapper.
  return (
    <div className={AUTH_PATHS.includes(pathname) ? "hidden sm:contents" : "contents"}>
      {children}
    </div>
  );
}
