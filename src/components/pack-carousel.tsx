"use client";

import { Children, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

/** More packs than this scroll sideways with arrow buttons; up to this many sit in a grid. */
export const PACKS_PER_VIEW = 3;

/**
 * The cards of the curated packs section. Up to three show side by side (stacked on phones);
 * with more, they scroll sideways (swipe, trackpad or the arrow buttons next to the heading)
 * so the visitor can explore the others.
 */
export function PackCarousel({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  const cards = Children.toArray(children);
  const scrollable = cards.length > PACKS_PER_VIEW;
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
    if (!scrollable) return;
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [scrollable, update]);

  const scroll = (direction: 1 | -1) =>
    track.current?.scrollBy({
      left: direction * track.current.clientWidth * 0.9,
      behavior: "smooth",
    });

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        {heading}
        {scrollable && (
          <div className="flex gap-2">
            <ArrowButton
              label="Previous blueprints"
              disabled={edges.start}
              onClick={() => scroll(-1)}
            >
              ‹
            </ArrowButton>
            <ArrowButton label="More blueprints" disabled={edges.end} onClick={() => scroll(1)}>
              ›
            </ArrowButton>
          </div>
        )}
      </div>
      {scrollable ? (
        <ul
          ref={track}
          onScroll={update}
          className="-mx-4 flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {cards.map((card, i) => (
            <li
              key={i}
              className="flex w-[85%] shrink-0 snap-start sm:w-[60%] md:w-[45%] lg:w-[calc((100%-3rem)/3)] [&>*]:w-full"
            >
              {card}
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">{cards}</div>
      )}
    </>
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
      className="flex size-10 items-center justify-center rounded-full border border-line bg-paper text-xl leading-none shadow-sm transition hover:scale-105 hover:shadow disabled:cursor-default disabled:opacity-30 disabled:shadow-none disabled:hover:scale-100"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
