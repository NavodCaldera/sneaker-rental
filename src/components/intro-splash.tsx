"use client";

import { useEffect, useState } from "react";
import { INTRO_SEEN_COOKIE } from "@/lib/intro";

const LINES = [
  "Whom do you want to become?",
  "How badly do you want it?",
  "What are you willing to sacrifice to get there?",
];

const TYPE_MS = 100; // half the speed of 50 ms
const ERASE_MS = 25; // 1.1x of the original 28 ms
const HOLD_MS = 1950; // how long each question stays once typed
const BETWEEN_MS = 350;
const FADE_MS = 700;

/**
 * Shown over the home page to visitors who have never signed in (product owner, 2026-10-13):
 * pure black, white letters, the three questions one at a time: each is typed, held, then erased
 * like backspacing before the next (the last is erased too), then the
 * screen fades away. "Skip" ends it
 * at once. It is shown once per visit (a session cookie), not on every page.
 */
export function IntroSplash() {
  const [text, setText] = useState("");
  const [line, setLine] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
    const finish = () => {
      setLeaving(true);
      later(() => setGone(true), FADE_MS);
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No typing: each question just appears for a moment.
      LINES.forEach((full, i) => {
        later(
          () => {
            setLine(i);
            setText(full);
          },
          i * (HOLD_MS + 600),
        );
      });
      later(finish, LINES.length * (HOLD_MS + 600));
      return () => timers.forEach(clearTimeout);
    }

    let at = 400;
    LINES.forEach((full, i) => {
      later(() => setLine(i), at);
      for (let c = 1; c <= full.length; c++) {
        later(() => setText(full.slice(0, c)), at + (c - 1) * TYPE_MS);
      }
      const last = i === LINES.length - 1;
      at += full.length * TYPE_MS + HOLD_MS;
      for (let c = full.length - 1; c >= 0; c--) {
        later(() => setText(full.slice(0, c)), at + (full.length - 1 - c) * ERASE_MS);
      }
      at += full.length * ERASE_MS + (last ? 0 : BETWEEN_MS);
    });
    later(finish, at);
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (leaving) document.cookie = `${INTRO_SEEN_COOKIE}=1; path=/; SameSite=Lax`;
  }, [leaving]);

  if (gone) return null;
  return (
    <div
      role="dialog"
      aria-label="Welcome to Nova"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black px-6 text-white transition-opacity ease-out"
      style={{ opacity: leaving ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
    >
      <p className="w-full text-left text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
        <span className="sr-only">{LINES[line]}</span>
        <span aria-hidden="true">
          {text}
          {/* The letters still to type are laid out but invisible, so the line breaks and the
              position of the text never move while it types or erases. */}
          <span className="invisible">{LINES[line].slice(text.length)}</span>
        </span>
      </p>
      <button
        type="button"
        onClick={() => {
          setLeaving(true);
          setTimeout(() => setGone(true), FADE_MS);
        }}
        className="absolute bottom-6 right-6 rounded-full border border-white/40 px-4 py-1.5 text-sm font-medium text-white hover:border-white"
      >
        Skip
      </button>
    </div>
  );
}
