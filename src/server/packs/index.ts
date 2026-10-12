import "server-only";
import { z } from "zod";
import type { Prisma, Role, StylePackStatus } from "@/generated/prisma/client";
import { bundleDailyCost } from "@/lib/pricing";
import { shoeName } from "@/lib/shoe-name";
import { shoeSizeInfo } from "@/lib/shoe-size";
import { ALL_EXPERIENCES } from "@/lib/shoe-style";
import { colomboDay } from "@/lib/wear-ledger";
import { releaseInfo, shoePricing } from "../catalogue/pricing";
import { type Tx, db } from "../db";
import { notify } from "../notify";
import { getActiveSettings } from "../settings";

/**
 * Style packs (product owner, 2026-10-13): curated rotations of listed pairs ("The Marathon &
 * Active Recovery"). Merchants and admins make them; a merchant's pack needs an admin's
 * approval before borrowers see it, an admin's own pack can be published directly. Each role
 * is one pair of the rotation, filled by listed pairs from any merchant. Packs carry no price
 * of their own: every pair is rented at its own price, so discounts never stack.
 */
export class PackError extends Error {}

export const PACK_LIMITS = { roles: 8, pairsPerRole: 4 } as const;

/** Pairs a pack can show: listed, not drafts, retired or sold, from verified merchants. */
const LISTED: Prisma.ShoeWhereInput = {
  status: { notIn: ["DRAFT", "RETIRED", "SOLD"] },
  merchant: { verified: true },
};

const roleSchema = z.object({
  name: z.string().trim().min(2, "Name each role").max(60),
  description: z.string().trim().max(160).default(""),
  experience: z
    .string()
    .trim()
    .default("")
    .refine((v) => v === "" || ALL_EXPERIENCES.includes(v), "Choose an experience from the list"),
  shoeIds: z
    .array(z.string().min(1))
    .min(1, "Pick at least one pair for each role")
    .max(PACK_LIMITS.pairsPerRole, `At most ${PACK_LIMITS.pairsPerRole} pairs per role`)
    .transform((ids) => [...new Set(ids)]),
});

export const packSchema = z.object({
  title: z.string().trim().min(3, "Give the pack a title").max(80),
  subtitle: z.string().trim().max(160).default(""),
  highlight: z.string().trim().max(120).default(""),
  roles: z
    .array(roleSchema)
    .min(1, "Add at least one role")
    .max(PACK_LIMITS.roles, `At most ${PACK_LIMITS.roles} roles`),
});

export type PackInput = z.infer<typeof packSchema>;

/** The editor posts its roles as JSON in a `roles` field. */
export function parsePackForm(formData: FormData) {
  let roles: unknown = [];
  try {
    roles = JSON.parse(String(formData.get("roles") ?? "[]"));
  } catch {
    roles = [];
  }
  return packSchema.safeParse({
    title: formData.get("title") ?? "",
    subtitle: formData.get("subtitle") ?? "",
    highlight: formData.get("highlight") ?? "",
    roles,
  });
}

type Actor = { id: string; role: Role };

function isAdmin(user: Actor) {
  return user.role === "ADMIN";
}

/** Pairs the editor offers: every listed pair, any merchant. */
export async function pickablePairs() {
  const shoes = await db.shoe.findMany({
    where: LISTED,
    orderBy: [{ brand: "asc" }, { model: "asc" }],
    include: {
      photos: { where: { kind: "FRONT" }, take: 1 },
      merchant: { select: { businessName: true } },
    },
  });
  return shoes.map((s) => ({
    id: s.id,
    name: shoeName(s),
    size: shoeSizeInfo(s).primary,
    merchant: s.merchant.businessName,
    /** Tells apart otherwise identical pairs, e.g. the same model listed twice */
    lifespanDays: s.lifespanDays,
    photoId: s.photos[0]?.id,
  }));
}

export type PickablePair = Awaited<ReturnType<typeof pickablePairs>>[number];

async function checkPairs(tx: Tx, input: PackInput) {
  const ids = [...new Set(input.roles.flatMap((r) => r.shoeIds))];
  const found = await tx.shoe.count({ where: { id: { in: ids }, ...LISTED } });
  if (found !== ids.length) {
    throw new PackError("Some of the chosen pairs aren't listed any more. Pick them again.");
  }
}

function rolesData(input: PackInput) {
  return input.roles.map((r, i) => ({
    position: i,
    name: r.name,
    description: r.description,
    experience: r.experience || null,
    shoes: { create: r.shoeIds.map((shoeId, j) => ({ shoeId, position: j })) },
  }));
}

/** A merchant's pack starts as a draft; an admin may publish theirs straight away. */
export async function createPack(user: Actor, input: PackInput, opts: { publish?: boolean } = {}) {
  if (user.role === "BORROWER") throw new PackError("Only merchants and admins make packs");
  const publish = isAdmin(user) && opts.publish === true;
  return db.$transaction(async (tx) => {
    await checkPairs(tx, input);
    return tx.stylePack.create({
      data: {
        title: input.title,
        subtitle: input.subtitle,
        highlight: input.highlight,
        createdById: user.id,
        status: publish ? "PUBLISHED" : "DRAFT",
        publishedAt: publish ? new Date() : null,
        reviewedById: publish ? user.id : null,
        roles: { create: rolesData(input) },
      },
    });
  });
}

/** The pack, if this user may edit it: its maker, or any admin. */
async function ownPack(tx: Tx, user: Actor, packId: string) {
  const pack = await tx.stylePack.findUnique({
    where: { id: packId },
    include: { createdBy: { select: { role: true } } },
  });
  if (!pack || (!isAdmin(user) && pack.createdById !== user.id)) {
    throw new PackError("Pack not found");
  }
  return pack;
}

/**
 * Save changes. When a merchant edits a published pack it goes back to the admins for review
 * (hidden until approved again), so borrowers only ever see approved content.
 */
export async function updatePack(user: Actor, packId: string, input: PackInput) {
  return db.$transaction(async (tx) => {
    const pack = await ownPack(tx, user, packId);
    await checkPairs(tx, input);
    const backToReview = !isAdmin(user) && pack.status === "PUBLISHED";
    await tx.stylePackRole.deleteMany({ where: { packId } });
    return tx.stylePack.update({
      where: { id: packId },
      data: {
        title: input.title,
        subtitle: input.subtitle,
        highlight: input.highlight,
        roles: { create: rolesData(input) },
        ...(backToReview && { status: "SUBMITTED", submittedAt: new Date(), publishedAt: null }),
      },
    });
  });
}

/** A merchant asks for a draft or rejected pack to be published. */
export async function submitPack(user: Actor, packId: string) {
  return db.$transaction(async (tx) => {
    const pack = await ownPack(tx, user, packId);
    if (pack.status !== "DRAFT" && pack.status !== "REJECTED") {
      throw new PackError("Only drafts and rejected packs can be sent for review");
    }
    return tx.stylePack.update({
      where: { id: packId },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
  });
}

/** Back to a draft: a merchant withdraws a pack from review, or takes it off the site. */
export async function withdrawPack(user: Actor, packId: string) {
  return db.$transaction(async (tx) => {
    const pack = await ownPack(tx, user, packId);
    if (pack.status !== "SUBMITTED" && pack.status !== "PUBLISHED") {
      throw new PackError("This pack isn't waiting for review or published");
    }
    return tx.stylePack.update({
      where: { id: packId },
      data: { status: "DRAFT", publishedAt: null },
    });
  });
}

export async function deletePack(user: Actor, packId: string) {
  await db.$transaction(async (tx) => {
    await ownPack(tx, user, packId);
    await tx.stylePack.delete({ where: { id: packId } });
  });
}

function requireAdmin(user: Actor) {
  if (!isAdmin(user)) throw new PackError("Only an admin can do that");
}

async function tellMaker(
  tx: Tx,
  pack: { createdById: string; title: string; createdBy: { role: Role } },
  title: string,
  body: string,
) {
  if (pack.createdBy.role !== "MERCHANT") return;
  await notify(tx, {
    userId: pack.createdById,
    kind: "STYLE_PACK",
    title,
    body,
    link: "/merchant/packs",
  });
}

/**
 * An admin publishes a pack: a merchant's pack once it was sent for review, or an admin's own
 * pack at any time. The merchant is told.
 */
export async function publishPack(user: Actor, packId: string) {
  requireAdmin(user);
  return db.$transaction(async (tx) => {
    const pack = await ownPack(tx, user, packId);
    if (pack.status === "PUBLISHED") throw new PackError("Already published");
    if (pack.createdBy.role === "MERCHANT" && pack.status !== "SUBMITTED") {
      throw new PackError("The merchant hasn't sent this pack for review");
    }
    const updated = await tx.stylePack.update({
      where: { id: packId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        reviewedById: user.id,
        reviewNote: null,
      },
    });
    await tellMaker(
      tx,
      pack,
      `Your style pack "${pack.title}" is live`,
      "An admin approved it. Borrowers now see it on the home page.",
    );
    return updated;
  });
}

const noteSchema = z.string().trim().min(3, "Say why").max(300);

/** An admin turns down a pack sent for review, saying why. */
export async function rejectPack(user: Actor, packId: string, note: string) {
  requireAdmin(user);
  const reason = noteSchema.parse(note);
  return db.$transaction(async (tx) => {
    const pack = await ownPack(tx, user, packId);
    if (pack.status !== "SUBMITTED") throw new PackError("Only packs waiting for review");
    const updated = await tx.stylePack.update({
      where: { id: packId },
      data: { status: "REJECTED", reviewNote: reason, reviewedById: user.id },
    });
    await tellMaker(
      tx,
      pack,
      `Your style pack "${pack.title}" needs changes`,
      `An admin didn't approve it: ${reason} Edit it and send it again.`,
    );
    return updated;
  });
}

/** An admin takes a published pack off the site, optionally saying why. */
export async function unpublishPack(user: Actor, packId: string, note = "") {
  requireAdmin(user);
  return db.$transaction(async (tx) => {
    const pack = await ownPack(tx, user, packId);
    if (pack.status !== "PUBLISHED") throw new PackError("This pack isn't published");
    const reason = note.trim().slice(0, 300) || null;
    const updated = await tx.stylePack.update({
      where: { id: packId },
      data: { status: "DRAFT", publishedAt: null, reviewNote: reason, reviewedById: user.id },
    });
    await tellMaker(
      tx,
      pack,
      `Your style pack "${pack.title}" was taken off the site`,
      reason ? `An admin unpublished it: ${reason}` : "An admin unpublished it.",
    );
    return updated;
  });
}

/** Packs to manage: a merchant's own, or every pack for an admin (waiting ones first). */
export async function listPacks(user: Actor) {
  const packs = await db.stylePack.findMany({
    where: isAdmin(user) ? {} : { createdById: user.id },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      createdBy: {
        select: { name: true, role: true, merchant: { select: { businessName: true } } },
      },
      _count: { select: { roles: true } },
    },
  });
  const order: Record<StylePackStatus, number> = {
    SUBMITTED: 0,
    PUBLISHED: 1,
    REJECTED: 2,
    DRAFT: 3,
  };
  return packs.sort((a, b) => order[a.status] - order[b.status]);
}

/** A pack in the editor's shape. */
export async function getPackForEdit(user: Actor, packId: string) {
  const pack = await db.$transaction((tx) => ownPack(tx, user, packId));
  const roles = await db.stylePackRole.findMany({
    where: { packId },
    orderBy: { position: "asc" },
    include: { shoes: { orderBy: { position: "asc" } } },
  });
  return {
    pack,
    input: {
      title: pack.title,
      subtitle: pack.subtitle,
      highlight: pack.highlight,
      roles: roles.map((r) => ({
        name: r.name,
        description: r.description,
        experience: r.experience ?? "",
        shoeIds: r.shoes.map((s) => s.shoeId),
      })),
    } satisfies PackInput,
  };
}

const packInclude = {
  roles: {
    orderBy: { position: "asc" as const },
    include: {
      shoes: {
        orderBy: { position: "asc" as const },
        where: { shoe: LISTED },
        include: {
          shoe: {
            include: {
              settings: true,
              photos: { where: { kind: "FRONT" as const }, take: 1 },
              rentalItems: { where: { status: "WAITING_HANDOFF" as const }, select: { id: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.StylePackInclude;

/**
 * A pack as borrowers see it: roles with their listed pairs and today's prices (from the
 * pricing engine), and what the rotation costs a day held together (wear splits 1/n, so it's
 * the average of one pair per role). Roles whose pairs all left the catalogue are dropped.
 */
async function viewPacks(where: Prisma.StylePackWhereInput, take?: number) {
  const [packs, active] = await Promise.all([
    db.stylePack.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      take,
      include: packInclude,
    }),
    getActiveSettings(),
  ]);
  const today = colomboDay(new Date());
  return packs
    .map((pack) => {
      const roles = pack.roles
        .map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description,
          experience: role.experience,
          pairs: role.shoes.map(({ shoe }) => {
            const release = releaseInfo(shoe, active, today);
            const pricing = shoePricing(shoe, release.discount);
            const reservedNext = shoe.rentalItems.length > 0;
            return {
              id: shoe.id,
              name: shoeName(shoe),
              size: shoeSizeInfo(shoe).primary,
              photoId: shoe.photos[0]?.id,
              priceToday: pricing.priceToday,
              lifeLeft: pricing.lifeLeft,
              /** Can be booked now, or reserved from its holder for a handoff */
              bookable:
                shoe.status === "AVAILABLE" || (shoe.status === "WITH_BORROWER" && !reservedNext),
            };
          }),
        }))
        .filter((r) => r.pairs.length > 0);
      const picks = roles.map((r) => r.pairs.find((p) => p.bookable) ?? r.pairs[0]);
      return {
        id: pack.id,
        title: pack.title,
        subtitle: pack.subtitle,
        highlight: pack.highlight,
        status: pack.status,
        createdById: pack.createdById,
        roles,
        rotationDailyCost:
          picks.length > 0 ? bundleDailyCost(picks.map((p) => p.priceToday)).toString() : null,
      };
    })
    .filter((p) => p.roles.length > 0);
}

export type PackView = Awaited<ReturnType<typeof viewPacks>>[number];

/** Published packs for the home page, newest first. */
export function publishedPacks(limit = 6) {
  return viewPacks({ status: "PUBLISHED" }, limit);
}

/** A pack's own page: anyone sees a published pack; its maker and admins can preview others. */
export async function packForViewer(packId: string, viewer: Actor | null) {
  const [pack] = await viewPacks({ id: packId });
  if (!pack) return null;
  if (pack.status === "PUBLISHED") return pack;
  if (viewer && (isAdmin(viewer) || viewer.id === pack.createdById)) return pack;
  return null;
}

/** The pairs to put in a borrower's bundle for a pack: one per role, bookable ones first. */
export async function packBundlePicks(packId: string) {
  const [pack] = await viewPacks({ id: packId, status: "PUBLISHED" });
  if (!pack) throw new PackError("Pack not found");
  return pack.roles.flatMap((r) => {
    const pick = r.pairs.find((p) => p.bookable);
    return pick ? [pick.id] : [];
  });
}
