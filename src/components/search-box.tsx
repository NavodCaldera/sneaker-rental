"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/components/ui";
import type { ShoeSuggestion } from "@/server/catalogue";

/**
 * Put it in a `relative` form: the list spans the form's full width.
 * The "Brand or model" search field with suggestions: as the visitor types, matching brands
 * and models drop down (ARIA combobox: arrow keys move, Enter picks, Escape closes). Picking
 * one fills the field and searches. Sends `q` with the surrounding form.
 */
export function SearchBox({ defaultValue = "" }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  const [items, setItems] = useState<ShoeSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    const text = value.trim();
    if (!text) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shoes/suggest?q=${encodeURIComponent(text)}`, {
          signal: ctrl.signal,
        });
        if (res.ok) {
          setItems(await res.json());
          setActive(-1);
        }
      } catch {
        /* a failed lookup just means no suggestions */
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [value]);

  function pick(s: ShoeSuggestion) {
    setValue(s.q);
    setOpen(false);
    // Let the field show the pick, then search with it.
    requestAnimationFrame(() => input.current?.form?.requestSubmit());
  }

  // Nothing typed means no suggestions, whatever an earlier lookup left behind.
  const shown = open && value.trim() !== "" && items.length > 0;
  return (
    <div
      className="flex min-w-0 flex-[2] flex-col"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label className="flex min-w-0 cursor-text flex-col justify-center rounded-full px-5 py-1.5 hover:bg-muted">
        <span className="text-xs font-semibold">Brand or model</span>
        <input
          ref={input}
          name="q"
          value={value}
          autoComplete="off"
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder="Search brands or models"
          className="bg-transparent text-sm outline-none placeholder:text-subtle"
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown" && items.length > 0) {
              e.preventDefault();
              setOpen(true);
              setActive((a) => (a + 1) % items.length);
            } else if (e.key === "ArrowUp" && items.length > 0) {
              e.preventDefault();
              setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
            } else if (e.key === "Enter" && shown && active >= 0) {
              e.preventDefault();
              pick(items[active]);
            }
          }}
        />
      </label>
      {shown && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-2xl border border-line bg-paper py-2 text-sm shadow-xl"
        >
          {items.map((s, i) => (
            <li
              key={`${s.kind}-${s.label}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cx(
                "flex cursor-pointer items-center justify-between gap-3 px-5 py-2",
                i === active && "bg-muted",
              )}
            >
              <span className="truncate">{s.label}</span>
              <span className="shrink-0 text-xs text-subtle">{s.kind}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
