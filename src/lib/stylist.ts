/**
 * The Nova Personal Stylist's shared pieces: the shoe item the chat shows, the keyword rule
 * engine (the fallback whenever the local model can't answer, on the server and in the browser)
 * and the reader for the model's JSON reply. No server imports, so the chat component uses it too.
 */

export type StylistShoeItem = {
  id: string;
  brand: string;
  model: string;
  experiences: string[];
  /** Formatted by the server from the pricing engine, e.g. "LKR 120.00" */
  priceToday: string;
  photoId?: string;
  condition: string;
};

export type StylistChatTurn = { sender: "user" | "stylist"; text: string };

export type StylistAnswer = {
  advice: string;
  suggestedShoes: StylistShoeItem[];
  /** "qwen" when the local model answered, "rules" for the keyword fallback */
  source: "qwen" | "rules";
};

/** The longest message (and history turn) the stylist reads, and how many turns it keeps. */
export const STYLIST_MESSAGE_MAX = 500;
export const STYLIST_HISTORY_MAX = 6;
/** The most pairs one reply recommends. */
export const STYLIST_MAX_PAIRS = 3;

const RUN = ["run", "jog", "tempo", "marathon", "athletic"];
const WORK = ["work", "office", "meeting", "corporate", "client"];
const WEEKEND = ["cafe", "brunch", "hangout", "weekend", "stroll", "coffee"];
const NIGHT = ["night", "dinner", "party", "club", "evening", "wedding"];

const has = (q: string, words: string[]) => words.some((w) => q.includes(w));

export function matchShoesForOccasion(query: string, shoes: StylistShoeItem[]): StylistShoeItem[] {
  const q = query.toLowerCase();

  // Keyword mappings to experiences
  const targetExp = has(q, RUN)
    ? "Morning Run"
    : has(q, WORK)
      ? "Work Day"
      : has(q, WEEKEND)
        ? "Weekend Stroll"
        : has(q, NIGHT)
          ? "Night Out"
          : null;

  if (targetExp) {
    const matched = shoes.filter((s) => s.experiences.includes(targetExp));
    if (matched.length > 0) return matched.slice(0, STYLIST_MAX_PAIRS);
  }

  // Fallback to text matching against brand/model (either may be empty)
  const textMatched = shoes.filter(
    (s) =>
      (s.brand && q.includes(s.brand.toLowerCase())) ||
      (s.model && q.includes(s.model.toLowerCase())) ||
      s.experiences.some((exp) => q.includes(exp.toLowerCase())),
  );
  if (textMatched.length > 0) return textMatched.slice(0, STYLIST_MAX_PAIRS);

  // Default to first 3 diverse pairs
  return shoes.slice(0, STYLIST_MAX_PAIRS);
}

export function generateStylistAdvice(query: string): string {
  const q = query.toLowerCase();
  if (has(q, ["run", "jog", "tempo", "marathon"])) {
    return "For your run, responsive cushioning, energy return, and breathable support are paramount. Here are our top high-performance pairs:";
  }
  if (has(q, WORK)) {
    return "For a professional work environment, you want clean lines, understated luxury, and all-day transit comfort. These refined pairs fit the brief perfectly:";
  }
  if (has(q, ["cafe", "brunch", "hangout", "weekend", "coffee"])) {
    return "For relaxed weekend moments, effortless style and laid-back comfort make the biggest statement. Here are top silhouettes for your rotation:";
  }
  if (has(q, ["night", "dinner", "party", "club", "evening"])) {
    return "For an evening occasion, a standout silhouette with clean polish will elevate your entire look. Here are curated statement pairs:";
  }
  return `For "${query}", you'll want versatile, elevated footwear that seamlessly transitions through your day. Here are our top handpicked recommendations:`;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The keyword rule engine's whole answer. */
export function ruleStylistAnswer(query: string, shoes: StylistShoeItem[]): StylistAnswer {
  return {
    advice: generateStylistAdvice(query),
    suggestedShoes: matchShoesForOccasion(query, shoes),
    source: "rules",
  };
}

/**
 * Reads the model's reply `{ "advice": string, "recommendedShoeIds": string[] }`. Keeps only ids
 * of shoes we offered (in the model's order, no repeats, at most three), and returns null when
 * the reply isn't that shape or names no shoe we have, so the caller falls back to the rules.
 */
export function readStylistReply(
  raw: string,
  shoes: StylistShoeItem[],
): Omit<StylistAnswer, "source"> | null {
  let parsed: unknown;
  try {
    // Some models wrap JSON in a ```json fence despite json_object mode.
    parsed = JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { advice, recommendedShoeIds } = parsed as Record<string, unknown>;
  if (typeof advice !== "string" || !advice.trim() || !Array.isArray(recommendedShoeIds)) {
    return null;
  }
  const byId = new Map(shoes.map((s) => [s.id, s]));
  const ids = [...new Set(recommendedShoeIds.filter((id): id is string => typeof id === "string"))];
  const suggestedShoes = ids
    .map((id) => byId.get(id))
    .filter((s): s is StylistShoeItem => !!s)
    .slice(0, STYLIST_MAX_PAIRS);
  if (suggestedShoes.length === 0) return null;
  // Models sometimes echo ids in the text, e.g. "Nike Dunk Low (cmv5…)": take them out.
  // Whole words only, so a short id never cuts letters out of a word.
  const text = shoes
    .reduce(
      (t, s) => t.replace(new RegExp(`\\s*\\(?\\b${escapeRegExp(s.id)}\\b\\)?`, "g"), ""),
      advice,
    )
    .replace(/\s{2,}/g, " ")
    .trim();
  return { advice: text.slice(0, 1000), suggestedShoes };
}
