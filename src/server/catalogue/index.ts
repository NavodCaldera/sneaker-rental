import "server-only";
import { z } from "zod";
import { D } from "@/lib/decimal";
import type { PhotoKind, Prisma, ShoeStatus } from "@/generated/prisma/client";
import { db } from "../db";
import { checkPhoto, savePhoto } from "../storage";

export class CatalogueError extends Error {}

/** OPEN DECISION: minimum and maximum lifespan a merchant may declare (§10). */
export const LIFESPAN_MIN_DAYS = 30;
export const LIFESPAN_MAX_DAYS = 1500;

export const LISTING_PHOTOS: { kind: PhotoKind; label: string }[] = [
  { kind: "FRONT", label: "Front" },
  { kind: "SIDE", label: "Side" },
  { kind: "SOLE", label: "Sole" },
  { kind: "INSIDE", label: "Inside" },
  { kind: "BOX", label: "Box" },
];

const MONEY_FORMAT = /^\d+(\.\d{1,2})?$/;

export const CATEGORIES = ["Running", "Lifestyle", "Basketball", "Skate", "Training", "Other"];

export const shoeSchema = z.object({
  brand: z.string().trim().min(1, "Enter the brand").max(60),
  model: z.string().trim().min(1, "Enter the model").max(80),
  size: z.string().trim().min(1, "Enter the size").max(20),
  category: z.enum(CATEGORIES as [string, ...string[]]),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  pickupAddress: z.string().trim().min(5, "Enter the pickup address").max(300),
  value: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter the value in LKR, up to 2 decimals")
    .refine(
      // Zod runs this even when the format check failed, so re-check before parsing.
      (v) => MONEY_FORMAT.test(v) && new D(v).gt(0) && new D(v).lte(10_000_000),
      "Value must be between 1 and 10,000,000",
    ),
  lifespanDays: z.coerce
    .number()
    .int("Whole days only")
    .min(LIFESPAN_MIN_DAYS, `At least ${LIFESPAN_MIN_DAYS} wear-days`)
    .max(LIFESPAN_MAX_DAYS, `At most ${LIFESPAN_MAX_DAYS} wear-days`),
});

export type ShoeInput = z.infer<typeof shoeSchema>;

export async function getMerchantForUser(userId: string) {
  const merchant = await db.merchant.findUnique({ where: { userId } });
  if (!merchant) throw new CatalogueError("No merchant profile for this account");
  return merchant;
}

/** Creates a Draft listing with its five listing photos (§5.1 step 2). */
export async function createShoe(
  merchantId: string,
  input: ShoeInput,
  photos: Partial<Record<PhotoKind, File>>,
) {
  for (const { kind, label } of LISTING_PHOTOS) checkPhoto(photos[kind] as File, label);
  const saved = [];
  for (const { kind } of LISTING_PHOTOS) {
    saved.push({ kind, ...(await savePhoto(photos[kind]!, `shoes/${merchantId}`)) });
  }
  return db.shoe.create({
    data: {
      ...input,
      description: input.description || null,
      merchantId,
      photos: { create: saved },
    },
  });
}

async function ownShoe(merchantId: string, shoeId: string) {
  const shoe = await db.shoe.findFirst({
    where: { id: shoeId, merchantId },
    include: { photos: true },
  });
  if (!shoe) throw new CatalogueError("Shoe not found");
  return shoe;
}

/** Draft → Available. Needs a verified merchant with a payout account, and all five photos. */
export async function publishShoe(merchantId: string, shoeId: string) {
  const shoe = await ownShoe(merchantId, shoeId);
  if (shoe.status !== "DRAFT") throw new CatalogueError("Only drafts can be published");
  const merchant = await db.merchant.findUniqueOrThrow({ where: { id: merchantId } });
  if (!merchant.verified)
    throw new CatalogueError("Your business must be verified before publishing");
  if (!merchant.payoutAccount) throw new CatalogueError("Add a payout account before publishing");
  const kinds = new Set(shoe.photos.map((p) => p.kind));
  if (!LISTING_PHOTOS.every((p) => kinds.has(p.kind))) {
    throw new CatalogueError("All five listing photos are required");
  }
  return db.shoe.update({
    where: { id: shoeId },
    data: { status: "AVAILABLE", publishedAt: new Date(), latestGrade: shoe.latestGrade ?? "A" },
  });
}

export async function deleteDraft(merchantId: string, shoeId: string) {
  const shoe = await ownShoe(merchantId, shoeId);
  if (shoe.status !== "DRAFT") throw new CatalogueError("Only drafts can be deleted");
  await db.shoe.delete({ where: { id: shoeId } });
}

export async function updatePayoutAccount(merchantId: string, payoutAccount: string) {
  const account = payoutAccount.trim();
  if (account.length < 6) throw new CatalogueError("Enter a valid payout account");
  return db.merchant.update({ where: { id: merchantId }, data: { payoutAccount: account } });
}

export async function listMerchantShoes(merchantId: string) {
  return db.shoe.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
    include: { photos: { where: { kind: "FRONT" }, take: 1 } },
  });
}

export async function getMerchantShoe(merchantId: string, shoeId: string) {
  const shoe = await db.shoe.findFirst({
    where: { id: shoeId, merchantId },
    include: {
      photos: { orderBy: { createdAt: "asc" } },
      rentalItems: {
        orderBy: { createdAt: "desc" },
        include: { rental: { include: { borrower: { select: { name: true } } } } },
      },
    },
  });
  if (!shoe) throw new CatalogueError("Shoe not found");
  return shoe;
}

/** Shoes a borrower can see: available now, or held by someone and open for a handoff reservation. */
export const BROWSABLE: ShoeStatus[] = ["AVAILABLE", "WITH_BORROWER"];

export type BrowseFilters = { size?: string; brand?: string; category?: string; q?: string };

export async function browseShoes(filters: BrowseFilters) {
  const where: Prisma.ShoeWhereInput = {
    status: { in: BROWSABLE },
    merchant: { verified: true },
    ...(filters.size && { size: filters.size }),
    ...(filters.brand && { brand: filters.brand }),
    ...(filters.category && { category: filters.category }),
    ...(filters.q && {
      OR: [
        { brand: { contains: filters.q, mode: "insensitive" } },
        { model: { contains: filters.q, mode: "insensitive" } },
      ],
    }),
  };
  return db.shoe.findMany({
    where,
    orderBy: [{ status: "asc" }, { publishedAt: "desc" }],
    include: {
      photos: { where: { kind: "FRONT" }, take: 1 },
      merchant: { select: { businessName: true } },
    },
  });
}

export async function browseFacets() {
  const shoes = await db.shoe.findMany({
    where: { status: { in: BROWSABLE }, merchant: { verified: true } },
    select: { size: true, brand: true, category: true },
  });
  const uniq = (xs: string[]) =>
    [...new Set(xs)].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return {
    sizes: uniq(shoes.map((s) => s.size)),
    brands: uniq(shoes.map((s) => s.brand)),
    categories: uniq(shoes.map((s) => s.category)),
  };
}

/** A listing as borrowers see it. Drafts, retired and sold shoes are hidden. */
export async function getListing(shoeId: string) {
  return db.shoe.findFirst({
    where: { id: shoeId, status: { notIn: ["DRAFT", "RETIRED", "SOLD"] } },
    include: {
      photos: {
        where: { kind: { in: LISTING_PHOTOS.map((p) => p.kind) } },
        orderBy: { createdAt: "asc" },
      },
      merchant: { select: { businessName: true } },
      rentalItems: { where: { status: "WAITING_HANDOFF" }, select: { id: true } },
    },
  });
}

// ─── Admin ─────────────────────────────────────────────────────────────────

export async function listMerchants() {
  return db.merchant.findMany({
    orderBy: [{ verified: "asc" }, { createdAt: "desc" }],
    include: {
      user: { select: { name: true, email: true, phone: true } },
      _count: { select: { shoes: true } },
    },
  });
}

export async function setMerchantVerified(merchantId: string, verified: boolean) {
  return db.merchant.update({ where: { id: merchantId }, data: { verified } });
}

/** Headline numbers for the merchant dashboard. */
export async function merchantSummary(merchantId: string) {
  const [byStatus, earned, paid] = await Promise.all([
    db.shoe.groupBy({ by: ["status"], where: { merchantId }, _count: true }),
    db.rentalItem.aggregate({
      where: { shoe: { merchantId }, status: { in: ["CLOSED", "LOST"] } },
      _sum: { merchantShare: true },
      _count: true,
    }),
    db.payout.aggregate({ where: { merchantId, status: "PAID" }, _sum: { amount: true } }),
  ]);
  const count = (s: string[]) =>
    byStatus.filter((r) => s.includes(r.status)).reduce((n, r) => n + r._count, 0);
  return {
    available: count(["AVAILABLE"]),
    out: count(["RESERVED", "OUT_FOR_DELIVERY", "WITH_BORROWER", "IN_HANDOFF"]),
    cleaning: count(["CLEANING"]),
    rentalsClosed: earned._count,
    earned: earned._sum.merchantShare?.toFixed(2) ?? "0.00",
    paidOut: paid._sum.amount?.toFixed(2) ?? "0.00",
  };
}
