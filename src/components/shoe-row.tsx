"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

/**
 * A titled row of cards that scrolls sideways (swipe, trackpad or the arrow buttons), with a
 * link to see them all.
 */
export function ShoeRow({
  title,
  subtitle,
  href,
  children,
}: {
  title: string;
  subtitle: string;
  /** "See all" destination */
  href: string;
  children: ReactNode;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 1,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  const scroll = (direction: 1 | -1) =>
    track.current?.scrollBy({
      left: direction * track.current.clientWidth * 0.9,
      behavior: "smooth",
    });

  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Link href={href} className="hover:underline">
              {title}
            </Link>
            <Link
              href={href}
              aria-label={`See all: ${title}`}
              className="flex size-8 items-center justify-center rounded-full bg-muted text-base hover:bg-line"
            >
              →
            </Link>
          </h2>
          <p className="text-sm text-subtle">{subtitle}</p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <ArrowButton
            label={`Scroll ${title} left`}
            disabled={edges.start}
            onClick={() => scroll(-1)}
          >
            ‹
          </ArrowButton>
          <ArrowButton
            label={`Scroll ${title} right`}
            disabled={edges.end}
            onClick={() => scroll(1)}
          >
            ›
          </ArrowButton>
        </div>
      </div>
      <ul
        ref={track}
        onScroll={update}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
    </section>
  );
}

/** One card slot in a row: about 2 per screen on phones, up to 6 on wide screens. */
export function ShoeRowItem({ children }: { children: ReactNode }) {
  return (
    <li className="w-[44%] shrink-0 snap-start sm:w-[30%] md:w-[23%] lg:w-[18.5%] xl:w-[15.5%]">
      {children}
    </li>
  );
}

function ArrowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-full border border-line bg-paper text-lg leading-none shadow-sm transition hover:scale-105 hover:shadow disabled:cursor-default disabled:opacity-30 disabled:shadow-none disabled:hover:scale-100"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
