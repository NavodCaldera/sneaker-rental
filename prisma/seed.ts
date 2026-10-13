/**
 * Development seed. Idempotent: safe to run repeatedly.
 * Dev accounts all use the password "password123".
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  type Audience,
  type Gender,
  type PricingMethod,
  PrismaClient,
  type Role,
} from "../src/generated/prisma/client";
import { personasFromStory } from "../src/lib/borrower-profile";
import { parseSize, shoeSizeFields } from "../src/lib/shoe-size";
import { hashPassword } from "../src/server/auth/password";
import { LocalDiskStorage, storageDir } from "../src/server/storage/local";

const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  }),
});

/** Launch defaults (CLAUDE.md). */
export const DEFAULT_SETTINGS = {
  merchantMargin: "0.10",
  platformMargin: "0.10",
  floor: "0.30",
  midpointRatio: "0.5479452054794521", // 200 / 365
  baseSteepness: "0.03",
  refLife: 365,
  minLifespanDays: 180, // ~6 months
  maxLifespanDays: 730, // 24 months; admins can extend per merchant
  maxDiscount: "0.10", // release discount cap
  releaseLeadDays: 10,
  releaseDiscountStep: "0.005",
  capitalRate: "0.12",
  holdCost: "0",
  offerResponseHours: 24, // OPEN DECISION: time to accept a higher price after an early return
  earlyReturnNoticeDays: 10, // an early return is asked for at least 10 days ahead
  maxPairsPerBundle: 4,
  disputeWindowDays: 3,
  freeReturnHours: 24,
  catchUpEnabled: false, // OPEN DECISION
  chargePastLife: true, // wear past L charged at the end-of-life price
};

const PASSWORD = "password123";
/** Sample tokens for each seed borrower. */
const STARTING_TOKENS = "200000";

const storage = new LocalDiskStorage(storageDir());
const PHOTO_KINDS = ["FRONT", "SIDE", "SOLE", "INSIDE", "BOX"] as const;
const COLOURS = [
  "#e8572a",
  "#2457b3",
  "#1f7a4d",
  "#7a3fb3",
  "#a15c00",
  "#c0352b",
  "#0e7490",
  "#4d4d4d",
];

/** Placeholder listing photo: a simple sneaker silhouette with the model and view name. */
function placeholderPhoto(brand: string, model: string, kind: string, colour: string) {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="#f3f3f1"/>
  <path d="M60 250 Q70 190 130 180 L190 150 Q215 140 230 165 L250 195 Q300 205 340 225 Q355 235 345 255 L60 255 Z" fill="${colour}"/>
  <rect x="55" y="255" width="295" height="22" rx="8" fill="#ffffff" stroke="#d0cfc9"/>
  <text x="200" y="320" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#161616">${esc(brand)} ${esc(model)}</text>
  <text x="200" y="348" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#6b6a65">${kind.toLowerCase()} view · sample photo</text>
</svg>`;
}

/** A sample profile as stored (DATE columns take UTC midnight). */
function profileData(p: (typeof users)[number]["profile"]) {
  return p
    ? {
        ...p,
        dateOfBirth: new Date(`${p.dateOfBirth}T00:00:00Z`),
        becoming: personasFromStory(p.becomingStory),
      }
    : {};
}

const users: {
  email: string;
  name: string;
  role: Role;
  businessName?: string;
  /** The account's one address and its city (customers and merchants) */
  address?: string;
  city?: string;
  /** Customers only: their profile (date of birth, gender, shoe size, who they want to become) */
  profile?: { dateOfBirth: string; gender: Gender; shoeSize: string; becomingStory: string };
}[] = [
  { email: "admin@sneakers.test", name: "Admin", role: "ADMIN" },
  {
    email: "kicks@sneakers.test",
    name: "Kasun Perera",
    role: "MERCHANT",
    businessName: "Colombo Kicks",
    address: "Colombo Kicks, 12 Galle Road",
    city: "Colombo 03",
  },
  {
    email: "sole@sneakers.test",
    name: "Dilani Fernando",
    role: "MERCHANT",
    businessName: "Sole Republic",
    address: "Sole Republic, 45 Duplication Road",
    city: "Colombo 04",
  },
  {
    email: "amaya@sneakers.test",
    name: "Amaya Silva",
    role: "BORROWER",
    address: "No. 8, Flower Road",
    city: "Colombo 07",
    profile: {
      dateOfBirth: "1998-03-14",
      gender: "FEMALE",
      shoeSize: "UK 5",
      becomingStory:
        "A marathon runner who travels the island on weekends. People see me as calm, fit and always up for an adventure.",
    },
  },
  {
    email: "ravi@sneakers.test",
    name: "Ravi Jayasuriya",
    role: "BORROWER",
    address: "21/3 Hill Street",
    city: "Dehiwala",
    profile: {
      dateOfBirth: "1993-07-02",
      gender: "MALE",
      shoeSize: "UK 9",
      becomingStory:
        "I want to build Sri Lanka's largest tech sensation, and still play cricket every Sunday. Confident and fast.",
    },
  },
  {
    email: "nimal@sneakers.test",
    name: "Nimal Wickrama",
    role: "BORROWER",
    address: "17 Temple Road",
    city: "Nugegoda",
    profile: {
      dateOfBirth: "2001-11-20",
      gender: "MALE",
      shoeSize: "UK 10",
      becomingStory:
        "A designer with my own studio: trusted by clients, with a style people remember from the street to the office.",
    },
  },
];

type SeedShoe = {
  brand: string;
  model: string;
  /** The size on the label, e.g. "UK 9" or "EU 38" */
  size: string;
  audience: Audience;
  /** One or more experiences from its audience's list */
  experiences: string[];
  value: string;
  lifespanDays: number;
  description?: string;
  /** Price curve the merchant picked; S-curve unless set */
  pricingMethod?: PricingMethod;
  /**
   * How many pairs of each size the listing has (product owner, 2026-10-13), e.g.
   * { "UK 8": 1, "UK 9": 2 }. Without it the listing is one pair of `size`.
   */
  stock?: Record<string, number>;
};

/** The first two are the acceptance-test shoes (business-model.md §9). */
const shoesByMerchant: Record<string, SeedShoe[]> = {
  "kicks@sneakers.test": [
    {
      brand: "Nike",
      model: "Pegasus 41",
      size: "UK 9",
      audience: "MEN",
      experiences: ["Morning Run"],
      value: "6000",
      lifespanDays: 365,
      description: "Acceptance-test shoe: 6,000 LKR, L = 365.",
    },
    {
      brand: "Nike",
      model: "Pegasus 41",
      size: "UK 9",
      audience: "MEN",
      experiences: ["Morning Run"],
      value: "6000",
      lifespanDays: 730,
      description: "Acceptance-test shoe: same shoe declared L = 730.",
    },
    {
      brand: "Adidas",
      model: "Samba OG",
      size: "UK 8",
      audience: "UNISEX",
      experiences: ["Weekend Stroll", "Work Day"],
      value: "10500",
      lifespanDays: 400,
    },
    {
      brand: "New Balance",
      model: "550",
      size: "UK 10",
      audience: "MEN",
      experiences: ["Work Day", "Weekend Stroll"],
      value: "11200",
      lifespanDays: 450,
    },
    {
      brand: "Asics",
      model: "Gel-Kayano 31",
      size: "UK 9",
      audience: "WOMEN",
      experiences: ["Morning Run"],
      value: "11800",
      lifespanDays: 300,
    },
    {
      brand: "Adidas",
      model: "Ultraboost Light",
      // Listed in EU, so a search for UK 5 finds it
      size: "EU 38",
      audience: "WOMEN",
      experiences: ["Studio & Gym"],
      value: "11900",
      lifespanDays: 300,

      stock: { "EU 38": 2, "EU 39": 1, "EU 40": 1 },
    },
    {
      brand: "Nike",
      model: "Air Force 1 Kids",
      size: "UK 3",
      audience: "BOYS",
      experiences: ["School Day"],
      value: "7000",
      lifespanDays: 200,
    },
    {
      brand: "Adidas",
      model: "Duramo SL Kids",
      size: "UK 2",
      audience: "BOYS",
      experiences: ["Sports Day"],
      value: "9000",
      lifespanDays: 200,
    },
  ],
  "sole@sneakers.test": [
    {
      brand: "Nike",
      model: "Air Jordan 1 Mid",
      size: "UK 9",
      audience: "MEN",
      experiences: ["Game Day"],
      value: "12000",
      lifespanDays: 365,
    },
    {
      brand: "Puma",
      model: "Suede Classic",
      size: "UK 7",
      audience: "WOMEN",
      experiences: ["Brunch & Errands"],
      value: "8500",
      lifespanDays: 350,
      pricingMethod: "EXPONENTIAL",
      description: "Priced on exponential decay: dearest when new, then falls fastest at first.",
    },
    {
      brand: "Converse",
      model: "Chuck 70 Hi",
      size: "UK 8",
      audience: "UNISEX",
      experiences: ["Night Out"],
      value: "7500",
      lifespanDays: 300,
    },
    {
      brand: "Nike",
      model: "Dunk Low",
      size: "UK 10",
      audience: "MEN",
      experiences: ["Night Out"],
      value: "11000",
      lifespanDays: 380,

      stock: { "UK 8": 1, "UK 10": 2, "UK 11": 1 },
    },
    {
      brand: "Vans",
      model: "Old Skool",
      size: "UK 9",
      audience: "MEN",
      experiences: ["Street Session"],
      value: "6800",
      lifespanDays: 250,
    },
    {
      brand: "Skechers",
      model: "Twinkle Toes",
      size: "UK 1",
      audience: "GIRLS",
      experiences: ["Party Time"],
      value: "8000",
      lifespanDays: 200,
    },
    {
      brand: "Nike",
      model: "Revolution 7 Kids",
      size: "UK 13",
      audience: "GIRLS",
      experiences: ["Playtime"],
      value: "8500",
      lifespanDays: 200,

      stock: { "UK 12": 1, "UK 13": 2 },
    },
    {
      brand: "Veja",
      model: "V-10",
      size: "UK 5",
      audience: "WOMEN",
      experiences: ["Weekend Stroll"],
      value: "10200",
      lifespanDays: 365,
    },
  ],
};

type SeedRole = { name: string; description: string; experience?: string; pairs: string[] };
type SeedPack = { title: string; subtitle: string; highlight: string; roles: SeedRole[] };

/** The example rotations, made by the admin and published (style packs, 2026-10-13). */
const STYLE_PACKS: SeedPack[] = [
  {
    title: "The Marathon & Active Recovery",
    subtitle: "Peak performance on tempo runs, cushioned support on recovery days.",
    highlight: "Hold 3 pairs · wear splits 3 ways · about a third of the wear on each",
    roles: [
      {
        name: "Compounding Grit",
        description:
          "The bedrock of daily discipline. Builds the quiet mental toughness that powers every ambition.",
        experience: "Morning Run",
        pairs: ["Nike Pegasus 41", "Asics Gel-Kayano 31"],
      },
      {
        name: "Threshold Velocity",
        description:
          "Unlocking your next echelon. The razor-sharp speed and propulsion that shatters personal limits.",
        experience: "Morning Run",
        pairs: ["Adidas Ultraboost Light"],
      },
      {
        name: "Restorative Dignity",
        description:
          "Honoring the recovery that fuels greatness. Elevated comfort keeping you composed between battles.",
        experience: "Weekend Stroll",
        pairs: ["New Balance 550"],
      },
    ],
  },
  {
    title: "The All-Week Urban Wardrobe",
    subtitle: "Polish by day, commute comfort in transit, casual weekend statements.",
    highlight: "1 work shoe + 1 commuter + 1 weekend icon",
    roles: [
      {
        name: "Boardroom Gravitas",
        description:
          "Impeccable executive polish. Sets an unmistakable standard of authority before you utter a word.",
        experience: "Work Day",
        pairs: ["New Balance 550", "Adidas Samba OG"],
      },
      {
        name: "Composed Transit",
        description:
          "Poise through the daily noise. Navigating city chaos with calm focus and unyielding posture.",
        experience: "Work Day",
        pairs: ["Veja V-10"],
      },
      {
        name: "Creative Magnetic Presence",
        description:
          "Authentic off-duty distinction. Effortless taste that turns casual downtime into an expression of style.",
        experience: "Night Out",
        pairs: ["Converse Chuck 70 Hi", "Vans Old Skool"],
      },
    ],
  },
  {
    title: "The 24/7 City Explorer",
    subtitle: "Timeless street pairs with athletic all-day comfort.",
    highlight: "Alternate daily · each pair dries out and stays fresher",
    roles: [
      {
        name: "Understated Poise",
        description:
          "Quiet confidence in every room. An ageless silhouette proving true elegance never shouts.",
        experience: "Street Session",
        pairs: ["Adidas Samba OG", "Puma Suede Classic"],
      },
      {
        name: "The Relentless Mover",
        description:
          "Grounded stamina and sculpted composure. Built for the days you construct your vision block by block.",
        experience: "Weekend Stroll",
        pairs: ["Nike Air Jordan 1 Mid", "Veja V-10"],
      },
    ],
  },
  {
    title: "The Milestone & Spotlight Echelon",
    subtitle: "Engineered for defining breakthroughs, keynote stages, and celebratory triumphs.",
    highlight:
      "Spotlight Poise: Command attention and celebrate major milestones with statement silhouettes, leaving yesterday's comfort behind.",
    roles: [
      {
        name: "The Stage Icon",
        description:
          "Unapologetic presence under the lights. A commanding silhouette that sets a modern cultural standard when all eyes are on you.",
        experience: "Night Out",
        pairs: ["Nike Dunk Low", "Nike Air Jordan 1 Mid"],
      },
      {
        name: "Evening Gravitas",
        description:
          "Refined celebratory polish. Sharp, elevated distinction for high-stakes receptions, investor dinners, and milestone toasts.",
        experience: "Night Out",
        pairs: ["Converse Chuck 70 Hi"],
      },
    ],
  },
];

/** Seeds the example packs once, from listed seed pairs (looked up by brand and model). */
/** Role names the example packs were first seeded with, replaced by the Transformation Economy copy. */
const LEGACY_ROLE_NAMES = new Set([
  "Daily Mileage Eater",
  "Speed & Tempo Day",
  "Active Recovery",
  "The Office Sharp",
  "The Transit Commuter",
  "The Weekend Statement",
  "The Low-Top Classic",
  "The High-Mileage Mover",
]);

/** Brings example packs seeded earlier up to the current role names and descriptions. */
async function refreshStylePackCopy() {
  let updated = 0;
  for (const pack of STYLE_PACKS) {
    const existing = await db.stylePack.findFirst({
      where: { title: pack.title },
      include: { roles: { orderBy: { position: "asc" } } },
    });
    if (!existing) continue;
    for (const [i, role] of pack.roles.entries()) {
      const row = existing.roles[i];
      if (!row || !LEGACY_ROLE_NAMES.has(row.name)) continue;
      await db.stylePackRole.update({
        where: { id: row.id },
        data: { name: role.name, description: role.description },
      });
      updated++;
    }
  }
  if (updated > 0) console.log(`Refreshed ${updated} example style pack roles`);
}

async function seedStylePacks() {
  if ((await db.stylePack.count()) > 0) await refreshStylePackCopy();
  const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@sneakers.test" } });
  const listed = await db.shoe.findMany({
    where: { status: { notIn: ["DRAFT", "RETIRED", "SOLD"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, brand: true, model: true },
  });
  const find = (name: string) => listed.find((s) => `${s.brand} ${s.model}` === name)?.id;
  const have = new Set(
    (await db.stylePack.findMany({ select: { title: true } })).map((p) => p.title),
  );
  let created = 0;
  for (const pack of STYLE_PACKS) {
    if (have.has(pack.title)) continue;
    created++;
    const roles = pack.roles
      .map((r) => ({ ...r, ids: [...new Set(r.pairs.map(find).filter((id) => id !== undefined))] }))
      .filter((r) => r.ids.length > 0);
    if (roles.length === 0) continue;
    await db.stylePack.create({
      data: {
        title: pack.title,
        subtitle: pack.subtitle,
        highlight: pack.highlight,
        status: "PUBLISHED",
        publishedAt: new Date(),
        createdById: admin.id,
        reviewedById: admin.id,
        roles: {
          create: roles.map((r, i) => ({
            position: i,
            name: r.name,
            description: r.description,
            experience: r.experience ?? null,
            shoes: { create: r.ids.map((shoeId, j) => ({ shoeId, position: j })) },
          })),
        },
      },
    });
  }
  if (created > 0) console.log(`Seeded ${created} example style pack(s)`);
}

/**
 * Adds the pairs a sample listing is missing for its `stock`: each a new available pair of the
 * same listing (same shoe, settings and photo files), unworn beyond what was declared when it
 * was listed. Returns how many it added. Pairs already there count, whatever their state.
 */
async function fillStock(firstId: string, stock: Record<string, number> | undefined) {
  if (!stock) return 0;
  const first = await db.shoe.findUniqueOrThrow({
    where: { id: firstId },
    include: { photos: { where: { kind: { in: [...PHOTO_KINDS] } } } },
  });
  const have = await db.shoe.groupBy({
    by: ["size"],
    where: { listingId: first.listingId },
    _count: true,
  });
  let added = 0;
  for (const [size, wanted] of Object.entries(stock)) {
    const label = parseSize(size)!;
    const missing = wanted - (have.find((h) => h.size === size)?._count ?? 0);
    for (let i = 0; i < missing; i++) {
      await db.shoe.create({
        data: {
          listingId: first.listingId,
          merchantId: first.merchantId,
          brand: first.brand,
          model: first.model,
          audience: first.audience,
          experiences: first.experiences,
          description: first.description,
          value: first.value,
          lifespanDays: first.lifespanDays,
          condition: first.condition,
          upgradeNotes: first.upgradeNotes,
          initialWear: first.initialWear,
          wear: first.initialWear,
          committedWear: first.initialWear,
          pricingMethod: first.pricingMethod,
          settingsId: first.settingsId,
          status: "AVAILABLE",
          latestGrade: "A",
          publishedAt: first.publishedAt ?? new Date(),
          ...shoeSizeFields(first.audience, label.system as "UK" | "EU" | "US", label.value),
          photos: {
            create: first.photos.map((p) => ({
              kind: p.kind,
              storageKey: p.storageKey,
              contentType: p.contentType,
            })),
          },
        },
      });
      added++;
    }
  }
  return added;
}

async function main() {
  if (!(await db.pricingSettings.findFirst())) {
    await db.pricingSettings.create({ data: DEFAULT_SETTINGS });
    console.log("Created default pricing settings");
  }
  // Seed shoes are listed under the settings version active now.
  const settings = await db.pricingSettings.findFirstOrThrow({
    where: { effectiveFrom: { lte: new Date() } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });

  const passwordHash = await hashPassword(PASSWORD);
  for (const u of users) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        verified: true,
        passwordHash,
        phone: "+94 77 000 0000",
        address: u.address ?? null,
        city: u.city ?? null,
        ...profileData(u.profile),
        merchant: u.businessName
          ? {
              create: {
                businessName: u.businessName,
                verified: true,
                payoutAccount: "BOC 0000 1111 2222",
              },
            }
          : undefined,
      },
      include: { merchant: true },
    });

    // Sample customers seeded before profiles (or their own words) existed get theirs.
    if (u.profile && (user.dateOfBirth === null || user.becomingStory === null)) {
      await db.user.update({ where: { id: user.id }, data: profileData(u.profile) });
    }
    // Sample accounts seeded before addresses (or cities) existed get theirs; an account
    // that already has a city is left alone.
    if (u.address && u.city && !user.city) {
      await db.user.update({
        where: { id: user.id },
        data: { address: u.address, city: u.city },
      });
    }

    // Borrowers start with tokens so they can book (1 token = 1 LKR).
    if (u.role === "BORROWER") {
      await db.walletEntry.upsert({
        where: { idempotencyKey: `seed:${user.id}` },
        update: {},
        create: {
          userId: user.id,
          kind: "TOP_UP",
          amount: STARTING_TOKENS,
          idempotencyKey: `seed:${user.id}`,
          note: "Starting tokens (sample data)",
        },
      });
    }

    const shoes = shoesByMerchant[u.email];
    if (!shoes || !user.merchant) continue;
    let added = 0;
    for (const [i, s] of shoes.entries()) {
      // Each sample shoe is added once. One seeded before audiences existed (still on the
      // migration's default, Men) gets its own audience and experiences.
      const existing = await db.shoe.findFirst({
        where: {
          merchantId: user.merchant.id,
          brand: s.brand,
          model: s.model,
          lifespanDays: s.lifespanDays,
        },
      });
      if (existing) {
        if (
          existing.audience === "MEN" &&
          (existing.audience !== s.audience || existing.experiences.join() !== s.experiences.join())
        ) {
          await db.shoe.update({
            where: { id: existing.id },
            data: { audience: s.audience, experiences: s.experiences },
          });
        }
        added += await fillStock(existing.id, s.stock);
        continue;
      }
      added++;
      const colour = COLOURS[(i + (u.email.startsWith("sole") ? 4 : 0)) % COLOURS.length];
      const photos = [];
      for (const kind of PHOTO_KINDS) {
        const storageKey = `seed/${s.brand}-${s.model}-${s.lifespanDays}-${kind}.svg`.replace(
          /[^\w./-]/g,
          "_",
        );
        await storage.put(
          storageKey,
          Buffer.from(placeholderPhoto(s.brand, s.model, kind, colour)),
        );
        photos.push({ kind, storageKey, contentType: "image/svg+xml" });
      }
      const label = parseSize(s.size)!;
      const { stock, ...fields } = s;
      const first = await db.shoe.create({
        data: {
          ...fields,
          ...shoeSizeFields(s.audience, label.system as "UK" | "EU" | "US", label.value),
          merchantId: user.merchant.id,
          settingsId: settings.id,
          status: "AVAILABLE",
          latestGrade: "A",
          publishedAt: new Date(),
          photos: { create: photos },
        },
      });
      added += await fillStock(first.id, stock);
    }
    if (added) console.log(`Seeded ${added} pairs for ${u.businessName}`);
  }
  // Backfill placeholder photos for any shoe seeded before photos existed.
  const bare = await db.shoe.findMany({ where: { photos: { none: {} } } });
  for (const [i, s] of bare.entries()) {
    for (const kind of PHOTO_KINDS) {
      const storageKey = `seed/${s.id}-${kind}.svg`;
      await storage.put(
        storageKey,
        Buffer.from(placeholderPhoto(s.brand, s.model, kind, COLOURS[i % COLOURS.length])),
      );
      await db.photo.create({
        data: { kind, storageKey, contentType: "image/svg+xml", shoeId: s.id },
      });
    }
  }
  if (bare.length) console.log(`Added placeholder photos to ${bare.length} shoes`);

  await seedStylePacks();

  console.log(`Seed complete. Dev password for all accounts: ${PASSWORD}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
