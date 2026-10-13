"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { shoeName } from "@/lib/shoe-name";
import {
  type StylistAnswer,
  type StylistShoeItem,
  STYLIST_HISTORY_MAX,
  ruleStylistAnswer,
} from "@/lib/stylist";
import { PhotoImg } from "./shoe-bits";

export type { StylistShoeItem };

type ChatMessage = {
  id: string;
  sender: "user" | "stylist";
  text: string;
  suggestedShoes?: StylistShoeItem[];
};

/** How long the chat waits for /api/stylist before answering from the shoes it already has. */
const STYLIST_FETCH_TIMEOUT_MS = 8000;

export function OccasionSearchBar({ shoes }: { shoes: StylistShoeItem[] }) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [, startTransition] = useTransition();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, isOpen]);

  const handleConsult = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsOpen(true);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: trimmed,
    };
    const history = messages
      .slice(-STYLIST_HISTORY_MAX)
      .map((m) => ({ sender: m.sender, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);

    // The server answers with the local model, or its own rule engine when the model is off.
    // If the server can't be reached, the rule engine answers here from the shoes we have.
    let answer: Pick<StylistAnswer, "advice" | "suggestedShoes">;
    try {
      const res = await fetch("/api/stylist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
        signal: AbortSignal.timeout(STYLIST_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Stylist replied ${res.status}`);
      const data = (await res.json()) as Partial<StylistAnswer>;
      if (typeof data.advice !== "string" || !Array.isArray(data.suggestedShoes)) {
        throw new Error("Unexpected stylist reply");
      }
      answer = { advice: data.advice, suggestedShoes: data.suggestedShoes };
    } catch {
      answer = ruleStylistAnswer(trimmed, shoes);
    }

    const stylistMsg: ChatMessage = {
      id: `stylist-${Date.now()}`,
      sender: "stylist",
      text: answer.advice,
      suggestedShoes: answer.suggestedShoes,
    };

    startTransition(() => {
      setIsTyping(false);
      setMessages((prev) => [...prev, stylistMsg]);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleConsult(inputValue);
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Luxury Occasion Search Bar Container */}
      <div className="w-full max-w-3xl">
        {/* On small screens the prompt sits above the bar, so the input keeps the full width */}
        <p
          aria-hidden="true"
          className="mb-2 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-ink md:hidden"
        >
          <span className="size-2 rounded-full bg-accent animate-pulse" aria-hidden="true" />
          WHAT ROOM ARE YOU ENTERING?
        </p>
        <form
          onSubmit={handleSubmit}
          className="group relative flex items-center rounded-full border border-line bg-paper/95 p-1.5 shadow-md backdrop-blur-md transition-all duration-300 hover:border-ink/40 hover:shadow-lg focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40"
        >
          {/* Stylist Prompt Label */}
          <div className="hidden md:flex items-center gap-2 pl-4 pr-3 border-r border-line shrink-0">
            <span className="size-2 rounded-full bg-accent animate-pulse" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider text-ink whitespace-nowrap">
              WHAT ROOM ARE YOU ENTERING?
            </span>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 px-3 sm:px-4">
            <label htmlFor="occasion-search" className="sr-only">
              WHAT ROOM ARE YOU ENTERING?
            </label>
            <input
              ref={inputRef}
              id="occasion-search"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Tell Nova the presence you want to command..."
              className="w-full bg-transparent text-sm font-normal text-ink text-ellipsis placeholder:text-subtle focus:outline-none"
            />
          </div>

          {/* Action Button */}
          <button
            type="submit"
            aria-label="Ask Nova Stylist"
            className="flex size-10 sm:size-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-transform duration-200 hover:scale-105 active:scale-95 shadow-sm"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </form>
      </div>

      {/* Floating Stylist Drawer / Bottom-Right Chat Window */}
      {isOpen && (
        <aside
          role="dialog"
          aria-label="Nova Stylist Concierge"
          className="fixed bottom-4 right-4 z-50 flex h-[520px] w-[370px] sm:w-[410px] max-w-[calc(100vw-2rem)] flex-col rounded-3xl border border-line bg-paper shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line bg-muted/60 px-4 py-3.5 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-full bg-accent text-on-accent font-bold text-xs shadow-sm">
                ✦
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink leading-tight">
                  Nova Personal Stylist
                </h3>
                <p className="text-[11px] text-subtle flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-accent inline-block" />
                  Curating for your occasion
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close stylist chat"
              className="flex size-8 items-center justify-center rounded-full text-subtle hover:bg-muted hover:text-ink transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages Body */}
          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3.5 text-sm [scrollbar-width:thin]"
          >
            {messages.length === 0 && (
              <div className="py-8 text-center text-subtle">
                <p className="text-xs">
                  Tell me where you&apos;re heading, and I&apos;ll curate the perfect shoes for your
                  rotation.
                </p>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                    m.sender === "user"
                      ? "bg-ink text-paper rounded-br-sm"
                      : "bg-muted text-ink rounded-bl-sm border border-line"
                  }`}
                >
                  {m.text}
                </div>

                {/* Recommended Shoe Cards in Chat */}
                {m.suggestedShoes && m.suggestedShoes.length > 0 && (
                  <div className="mt-2.5 w-full space-y-2">
                    <p className="text-[11px] font-semibold text-subtle uppercase tracking-wider">
                      Recommended Pairs:
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {m.suggestedShoes.map((shoe) => (
                        <Link
                          key={shoe.id}
                          href={`/shoes/${shoe.id}`}
                          className="group flex items-center gap-3 rounded-xl border border-line bg-paper p-2.5 transition-all hover:border-accent hover:shadow-sm"
                        >
                          <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                            <PhotoImg
                              id={shoe.photoId}
                              alt={shoeName(shoe)}
                              className="size-full object-cover transition group-hover:scale-105"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-semibold text-ink truncate group-hover:underline">
                              {shoeName(shoe)}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-bold text-ink">{shoe.priceToday}</span>
                              <span className="text-[10px] text-subtle">per day</span>
                            </div>
                            <span className="text-[10px] text-subtle">
                              Condition: {shoe.condition}
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-ink group-hover:translate-x-0.5 transition-transform">
                            →
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center gap-1.5 text-subtle text-xs py-1">
                <span className="size-1.5 rounded-full bg-accent animate-bounce" />
                <span className="size-1.5 rounded-full bg-accent animate-bounce [animation-delay:0.2s]" />
                <span className="size-1.5 rounded-full bg-accent animate-bounce [animation-delay:0.4s]" />
                <span className="ml-1 text-[11px]">Nova Stylist is curating...</span>
              </div>
            )}
          </div>

          {/* Quick Filter Chips Inside Chat */}
          <div className="border-t border-line bg-muted/40 px-3 py-2 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {["Morning Run", "Work Day", "Weekend Stroll", "Night Out"].map((exp) => (
              <button
                key={exp}
                type="button"
                onClick={() => handleConsult(`Show me options for ${exp}`)}
                className="whitespace-nowrap rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] text-subtle transition hover:border-ink hover:text-ink"
              >
                {exp}
              </button>
            ))}
          </div>

          {/* Chat Input Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const input = form.elements.namedItem("chatInput") as HTMLInputElement;
              if (input && input.value) {
                handleConsult(input.value);
                input.value = "";
              }
            }}
            className="flex items-center gap-2 border-t border-line p-3 bg-paper"
          >
            <input
              name="chatInput"
              type="text"
              placeholder="Ask for alternatives or details..."
              className="flex-1 rounded-full border border-line bg-muted/40 px-3.5 py-2 text-xs text-ink placeholder:text-subtle focus:border-ink focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Send reply"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent hover:opacity-90 transition-transform active:scale-95"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </form>
        </aside>
      )}

      {/* Floating launcher pill when minimized */}
      {!isOpen && messages.length > 0 && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-accent/40 bg-paper px-4 py-2.5 text-xs font-semibold text-ink shadow-xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 hover:border-accent"
        >
          <span className="size-2 rounded-full bg-accent animate-pulse" />
          <span>Nova Stylist ({messages.length})</span>
        </button>
      )}
    </div>
  );
}
