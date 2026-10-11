/**
 * Development seed. Idempotent: safe to run repeatedly.
 * Dev accounts all use the password "password123".
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  type Audience,
  type PricingMethod,
  PrismaClient,
  type Role,
} from "../src/generated/prisma/client";
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
  minLifespanDays: 183, // 6 months
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

const users: {
  email: string;
  name: string;
  role: Role;
  businessName?: string;
  /** The account's one address and its city (customers and merchants) */
  address?: string;
  city?: string;
  /** Customers only, in whole years */
  age?: number;
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
    age: 28,
  },
  {
    email: "ravi@sneakers.test",
    name: "Ravi Jayasuriya",
    role: "BORROWER",
    address: "21/3 Hill Street",
    city: "Dehiwala",
    age: 33,
  },
  {
    email: "nimal@sneakers.test",
    name: "Nimal Wickrama",
    role: "BORROWER",
    address: "17 Temple Road",
    city: "Nugegoda",
    age: 25,
  },
];

type SeedShoe = {
  brand: string;
  model: string;
  /** The size on the label, e.g. "UK 9" or "EU 38" */
  size: string;
  audience: Audience;
  experience: string;
  value: string;
  lifespanDays: number;
  description?: string;
  /** Price curve the merchant picked; S-curve unless set */
  pricingMethod?: PricingMethod;
};

/** The first two are the acceptance-test shoes (business-model.md §9). */
const shoesByMerchant: Record<string, SeedShoe[]> = {
  "kicks@sneakers.test": [
    {
      brand: "Nike",
      model: "Pegasus 41",
      size: "UK 9",
      audience: "MEN",
      experience: "Morning Run",
      value: "6000",
      lifespanDays: 365,
      description: "Acceptance-test shoe: 6,000 LKR, L = 365.",
    },
    {
      brand: "Nike",
      model: "Pegasus 41",
      size: "UK 9",
      audience: "MEN",
      experience: "Morning Run",
      value: "6000",
      lifespanDays: 730,
      description: "Acceptance-test shoe: same shoe declared L = 730.",
    },
    {
      brand: "Adidas",
      model: "Samba OG",
      size: "UK 8",
      audience: "UNISEX",
      experience: "Weekend Stroll",
      value: "28000",
      lifespanDays: 400,
    },
    {
      brand: "New Balance",
      model: "550",
      size: "UK 10",
      audience: "MEN",
      experience: "Work Day",
      value: "32000",
      lifespanDays: 450,
    },
    {
      brand: "Asics",
      model: "Gel-Kayano 31",
      size: "UK 9",
      audience: "WOMEN",
      experience: "Morning Run",
      value: "38000",
      lifespanDays: 300,
    },
    {
      brand: "Adidas",
      model: "Ultraboost Light",
      // Listed in EU, so a search for UK 5 finds it
      size: "EU 38",
      audience: "WOMEN",
      experience: "Studio & Gym",
      value: "36000",
      lifespanDays: 300,
    },
    {
      brand: "Nike",
      model: "Air Force 1 Kids",
      size: "UK 3",
      audience: "BOYS",
      experience: "School Day",
      value: "15000",
      lifespanDays: 200,
    },
    {
      brand: "Adidas",
      model: "Duramo SL Kids",
      size: "UK 2",
      audience: "BOYS",
      experience: "Sports Day",
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
      experience: "Game Day",
      value: "42000",
      lifespanDays: 365,
    },
    {
      brand: "Puma",
      model: "Suede Classic",
      size: "UK 7",
      audience: "WOMEN",
      experience: "Brunch & Errands",
      value: "18000",
      lifespanDays: 350,
      pricingMethod: "EXPONENTIAL",
      description: "Priced on exponential decay: dearest when new, then falls fastest at first.",
    },
    {
      brand: "Converse",
      model: "Chuck 70 Hi",
      size: "UK 8",
      audience: "UNISEX",
      experience: "Night Out",
      value: "16000",
      lifespanDays: 300,
    },
    {
      brand: "Nike",
      model: "Dunk Low",
      size: "UK 10",
      audience: "MEN",
      experience: "Night Out",
      value: "35000",
      lifespanDays: 380,
    },
    {
      brand: "Vans",
      model: "Old Skool",
      size: "UK 9",
      audience: "MEN",
      experience: "Street Session",
      value: "14000",
      lifespanDays: 250,
    },
    {
      brand: "Skechers",
      model: "Twinkle Toes",
      size: "UK 1",
      audience: "GIRLS",
      experience: "Party Time",
      value: "8000",
      lifespanDays: 200,
    },
    {
      brand: "Nike",
      model: "Revolution 7 Kids",
      size: "UK 13",
      audience: "GIRLS",
      experience: "Playtime",
      value: "8500",
      lifespanDays: 200,
    },
    {
      brand: "Veja",
      model: "V-10",
      size: "UK 5",
      audience: "WOMEN",
      experience: "Weekend Stroll",
      value: "30000",
      lifespanDays: 365,
    },
  ],
};

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
        age: u.age ?? null,
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

    // Sample customers seeded before ages existed get theirs.
    if (u.age && user.age === null) {
      await db.user.update({ where: { id: user.id }, data: { age: u.age } });
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
      // migration's default, Men) gets its own audience and experience.
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
          (existing.audience !== s.audience || existing.experience !== s.experience)
        ) {
          await db.shoe.update({
            where: { id: existing.id },
            data: { audience: s.audience, experience: s.experience },
          });
        }
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
      await db.shoe.create({
        data: {
          ...s,
          ...shoeSizeFields(s.audience, label.system as "UK" | "EU" | "US", label.value),
          merchantId: user.merchant.id,
          settingsId: settings.id,
          status: "AVAILABLE",
          latestGrade: "A",
          publishedAt: new Date(),
          photos: { create: photos },
        },
      });
    }
    if (added) console.log(`Seeded ${added} shoes for ${u.businessName}`);
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

  console.log(`Seed complete. Dev password for all accounts: ${PASSWORD}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
