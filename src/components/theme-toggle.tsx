"use client";

import { useEffect, useState } from "react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

/**
 * Switches between day and night mode. Until the visitor picks one, the page follows the
 * device setting; a pick is stored in a cookie for a year.
 */
export function ThemeToggle({ initial }: { initial: Theme | null }) {
  const [theme, setTheme] = useState<Theme | null>(initial);

  // No pick yet: show the mode the device is in, and follow it if it changes.
  useEffect(() => {
    if (initial) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => setTheme(media.matches ? "dark" : "light");
    follow();
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [initial]);

  const night = theme === "dark";
  const next: Theme = night ? "light" : "dark";
  const label = night ? "Switch to day mode" : "Switch to night mode";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
        setTheme(next);
      }}
      className="flex size-9 items-center justify-center rounded-full border border-line hover:bg-muted"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {night ? (
          // Sun: switch to day.
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          // Moon: switch to night.
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        )}
      </svg>
    </button>
  );
}
