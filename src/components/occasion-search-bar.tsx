"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { PhotoImg } from "./shoe-bits";

export type StylistShoeItem = {
  id: string;
  brand: string;
  model: string;
  experiences: string[];
  priceToday: string;
  photoId?: string;
  condition: string;
};

type ChatMessage = {
  id: string;
  sender: "user" | "stylist";
  text: string;
  suggestedShoes?: StylistShoeItem[];
};



function matchShoesForOccasion(query: string, shoes: StylistShoeItem[]): StylistShoeItem[] {
  const q = query.toLowerCase();

  // Keyword mappings to experiences & shoe models
  let targetExp: string | null = null;
  if (q.includes("run") || q.includes("jog") || q.includes("tempo") || q.includes("marathon") || q.includes("athletic")) {
    targetExp = "Morning Run";
  } else if (q.includes("work") || q.includes("office") || q.includes("meeting") || q.includes("corporate") || q.includes("client")) {
    targetExp = "Work Day";
  } else if (q.includes("cafe") || q.includes("brunch") || q.includes("hangout") || q.includes("weekend") || q.includes("stroll") || q.includes("coffee")) {
    targetExp = "Weekend Stroll";
  } else if (q.includes("night") || q.includes("dinner") || q.includes("party") || q.includes("club") || q.includes("evening") || q.includes("wedding")) {
    targetExp = "Night Out";
  }

  if (targetExp) {
    const matched = shoes.filter((s) => s.experiences.includes(targetExp));
    if (matched.length > 0) return matched.slice(0, 3);
  }

  // Fallback to text matching against brand/model
  const textMatched = shoes.filter(
    (s) =>
      q.includes(s.brand.toLowerCase()) ||
      q.includes(s.model.toLowerCase()) ||
      s.experiences.some((exp) => q.includes(exp.toLowerCase())),
  );
  if (textMatched.length > 0) return textMatched.slice(0, 3);

  // Default to first 3 diverse pairs
  return shoes.slice(0, 3);
}

function generateStylistAdvice(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("run") || q.includes("jog") || q.includes("tempo") || q.includes("marathon")) {
    return "For your run, responsive cushioning, energy return, and breathable support are paramount. Here are our top high-performance pairs:";
  }
  if (q.includes("work") || q.includes("office") || q.includes("meeting") || q.includes("corporate") || q.includes("client")) {
    return "For a professional work environment, you want clean lines, understated luxury, and all-day transit comfort. These refined pairs fit the brief perfectly:";
  }
  if (q.includes("cafe") || q.includes("brunch") || q.includes("hangout") || q.includes("weekend") || q.includes("coffee")) {
    return "For relaxed weekend moments, effortless style and laid-back comfort make the biggest statement. Here are top silhouettes for your rotation:";
  }
  if (q.includes("night") || q.includes("dinner") || q.includes("party") || q.includes("club") || q.includes("evening")) {
    return "For an evening occasion, a standout silhouette with clean polish will elevate your entire look. Here are curated statement pairs:";
  }
  return `For "${query}", you'll want versatile, elevated footwear that seamlessly transitions through your day. Here are our top handpicked recommendations:`;
}

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

  const handleConsult = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsOpen(true);
    const userMsgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);

    setTimeout(() => {
      const recommendations = matchShoesForOccasion(trimmed, shoes);
      const advice = generateStylistAdvice(trimmed);

      const stylistMsg: ChatMessage = {
        id: `stylist-${Date.now()}`,
        sender: "stylist",
        text: advice,
        suggestedShoes: recommendations,
      };

      startTransition(() => {
        setIsTyping(false);
        setMessages((prev) => [...prev, stylistMsg]);
      });
    }, 600);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleConsult(inputValue);
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Luxury Occasion Search Bar Container */}
      <div className="w-full max-w-2xl">
        <form
          onSubmit={handleSubmit}
          className="group relative flex items-center rounded-full border border-line bg-paper/95 p-1.5 shadow-md backdrop-blur-md transition-all duration-300 hover:border-ink/40 hover:shadow-lg focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40"
        >
          {/* Stylist Prompt Label */}
          <div className="hidden sm:flex items-center gap-2 pl-4 pr-3 border-r border-line shrink-0">
            <span
              className="size-2 rounded-full bg-accent animate-pulse"
              aria-hidden="true"
            />
            <span className="text-xs font-bold uppercase tracking-wider text-ink whitespace-nowrap">
              What&apos;s the occasion?
            </span>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 px-3 sm:px-4">
            <label htmlFor="occasion-search" className="sr-only">
              What&apos;s the occasion?
            </label>
            <input
              ref={inputRef}
              id="occasion-search"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Tell Nova your plans..."
              className="w-full bg-transparent text-sm sm:text-base font-normal text-ink placeholder:text-subtle focus:outline-none"
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
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
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
                  Tell me where you&apos;re heading, and I&apos;ll curate the perfect shoes for your rotation.
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
                              alt={`${shoe.brand} ${shoe.model}`}
                              className="size-full object-cover transition group-hover:scale-105"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-semibold text-ink truncate group-hover:text-accent transition-colors">
                              {shoe.brand} {shoe.model}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-bold text-ink">
                                {shoe.priceToday}
                              </span>
                              <span className="text-[10px] text-subtle">per day</span>
                            </div>
                            <span className="text-[10px] text-subtle">
                              Condition: {shoe.condition}
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-accent group-hover:translate-x-0.5 transition-transform">
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
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
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
