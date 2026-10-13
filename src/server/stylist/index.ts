import "server-only";
import { STYLIST_SYSTEM_PROMPT } from "../../../ai-service/system-prompt";
import { ageOn, isoDate, shoppingProfile } from "@/lib/borrower-profile";
import { D } from "@/lib/decimal";
import { formatLKR } from "@/lib/format";
import { cardPair, groupByListing, sizeRange } from "@/lib/listing";
import { shoeName } from "@/lib/shoe-name";
import { conditionShort } from "@/lib/shoe-condition";
import { shoeSizeInfo } from "@/lib/shoe-size";
import { audienceLabel } from "@/lib/shoe-style";
import {
  type StylistAnswer,
  type StylistChatTurn,
  type StylistShoeItem,
  readStylistReply,
  ruleStylistAnswer,
} from "@/lib/stylist";
import { colomboDay } from "@/lib/wear-ledger";
import { type SessionUser, colomboToday } from "@/server/auth/service";
import { browseShoes } from "@/server/catalogue";
import { releaseInfo, shoePricing } from "@/server/catalogue/pricing";
import { getActiveSettings } from "@/server/settings";

/** Where the local model runs (Ollama's OpenAI-compatible API); "off" turns it off. */
const LLM_URL = process.env.STYLIST_LLM_URL ?? "http://127.0.0.1:11434/v1";
const LLM_MODEL = process.env.STYLIST_LLM_MODEL ?? "qwen2.5:14b";
/** How long we wait for the model before answering with the rule engine. */
const LLM_TIMEOUT_MS = Number(process.env.STYLIST_LLM_TIMEOUT_MS ?? 3500);

type CatalogueEntry = { item: StylistShoeItem; context: string };

/**
 * The bookable catalogue, one entry per listing (the pair a Browse card shows: the biggest
 * discount, then the lowest price). Prices come from the pricing engine through `shoePricing`.
 */
async function stylistCatalogue(): Promise<CatalogueEntry[]> {
  const [shoes, active] = await Promise.all([browseShoes({}), getActiveSettings()]);
  const today = colomboDay(new Date());
  return groupByListing(shoes).map((group) => {
    const priced = group.map((pair) => {
      const release = releaseInfo(pair, active, today);
      return { pair, pricing: shoePricing(pair, release.discount), discount: release.discount };
    });
    const { pair: shoe, pricing } = cardPair(priced, (p) => ({
      discount: p.discount,
      price: new D(p.pricing.priceToday),
    }));
    const item: StylistShoeItem = {
      id: shoe.id,
      brand: shoe.brand,
      model: shoe.model,
      experiences: shoe.experiences,
      priceToday: formatLKR(pricing.priceToday),
      photoId: shoe.photos[0]?.id,
      condition: conditionShort(shoe.condition),
    };
    const context = JSON.stringify({
      id: shoe.id,
      name: shoeName(shoe),
      brand: shoe.brand,
      model: shoe.model,
      for: audienceLabel(shoe.audience),
      experiences: shoe.experiences,
      sizes: sizeRange(group.map((p) => shoeSizeInfo(p).primary)),
      pricePerDay: item.priceToday,
      condition: item.condition,
    });
    return { item, context };
  });
}

/** The items the chat can show before it asks the server (the home page passes them down). */
export async function stylistShoes(): Promise<StylistShoeItem[]> {
  return (await stylistCatalogue()).map((e) => e.item);
}

/** What the model may know about a signed-in borrower: their own words, age and shoe size. */
function profileContext(user: SessionUser | null): string {
  if (!user || user.role !== "BORROWER") return "Not signed in.";
  const today = colomboToday();
  const shopping = shoppingProfile(user, today);
  const lines = [
    user.becomingStory && `Whom they want to become: ${user.becomingStory}`,
    user.dateOfBirth && `Age: ${ageOn(isoDate(user.dateOfBirth), today)}`,
    user.shoeSize && `Shoe size: ${user.shoeSize}`,
    shopping && `Shops for: ${audienceLabel(shopping.audience)}`,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : "Signed in, no profile yet.";
}

/** Asks the local model; null when it is off, offline, slow or replies with something unusable. */
async function askLocalModel(
  message: string,
  history: StylistChatTurn[],
  catalogue: CatalogueEntry[],
  user: SessionUser | null,
): Promise<Omit<StylistAnswer, "source"> | null> {
  if (LLM_URL === "off" || catalogue.length === 0) return null;
  const context = [
    "PERSON",
    profileContext(user),
    "",
    "CATALOGUE (one JSON object per line)",
    ...catalogue.map((e) => e.context),
  ].join("\n");
  try {
    const res = await fetch(`${LLM_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: STYLIST_SYSTEM_PROMPT },
          { role: "system", content: context },
          ...history.map((t) => ({
            role: t.sender === "user" ? "user" : "assistant",
            content: t.text,
          })),
          { role: "user", content: message },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    return readStylistReply(
      content,
      catalogue.map((e) => e.item),
    );
  } catch {
    // Offline (connection refused), timed out, or not JSON: the rule engine answers instead.
    return null;
  }
}

/** The stylist's answer: the local model's when it can, otherwise the keyword rule engine's. */
export async function stylistAnswer(
  message: string,
  history: StylistChatTurn[],
  user: SessionUser | null,
): Promise<StylistAnswer> {
  const catalogue = await stylistCatalogue();
  const fromModel = await askLocalModel(message, history, catalogue, user);
  if (fromModel) return { ...fromModel, source: "qwen" };
  return ruleStylistAnswer(
    message,
    catalogue.map((e) => e.item),
  );
}
