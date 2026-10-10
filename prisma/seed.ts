/**
 * Development seed. Idempotent: safe to run repeatedly.
 * Dev accounts all use the password "password123".
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Role } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/auth/password";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Launch defaults (CLAUDE.md). */
export const DEFAULT_SETTINGS = {
  merchantMargin: "0.10",
  platformMargin: "0.10",
  floor: "0.30",
  midpointRatio: "0.5479452054794521", // 200 / 365
  baseSteepness: "0.03",
  idleDiscountCap: "0.05",
  depositPerPair: "5000",
  maxPairsPerBundle: 4,
  disputeWindowDays: 3,
  freeReturnHours: 24,
  deliveryBookingFee: null, // OPEN DECISION
  catchUpEnabled: false, // OPEN DECISION
};

const PASSWORD = "password123";

const users: { email: string; name: string; role: Role; businessName?: string }[] = [
  { email: "admin@sneakers.test", name: "Admin", role: "ADMIN" },
  {
    email: "kicks@sneakers.test",
    name: "Kasun Perera",
    role: "MERCHANT",
    businessName: "Colombo Kicks",
  },
  {
    email: "sole@sneakers.test",
    name: "Dilani Fernando",
    role: "MERCHANT",
    businessName: "Sole Republic",
  },
  { email: "amaya@sneakers.test", name: "Amaya Silva", role: "BORROWER" },
  { email: "ravi@sneakers.test", name: "Ravi Jayasuriya", role: "BORROWER" },
  { email: "nimal@sneakers.test", name: "Nimal Wickrama", role: "BORROWER" },
];

type SeedShoe = {
  brand: string;
  model: string;
  size: string;
  category: string;
  value: string;
  lifespanDays: number;
  description?: string;
};

/** The first two are the acceptance-test shoes (business-model.md §9). */
const shoesByMerchant: Record<string, SeedShoe[]> = {
  "kicks@sneakers.test": [
    {
      brand: "Nike",
      model: "Pegasus 41",
      size: "UK 9",
      category: "Running",
      value: "6000",
      lifespanDays: 365,
      description: "Acceptance-test shoe: 6,000 LKR, L = 365.",
    },
    {
      brand: "Nike",
      model: "Pegasus 41",
      size: "UK 9",
      category: "Running",
      value: "6000",
      lifespanDays: 730,
      description: "Acceptance-test shoe: same shoe declared L = 730.",
    },
    {
      brand: "Adidas",
      model: "Samba OG",
      size: "UK 8",
      category: "Lifestyle",
      value: "28000",
      lifespanDays: 400,
    },
    {
      brand: "New Balance",
      model: "550",
      size: "UK 10",
      category: "Lifestyle",
      value: "32000",
      lifespanDays: 450,
    },
    {
      brand: "Asics",
      model: "Gel-Kayano 31",
      size: "UK 9",
      category: "Running",
      value: "38000",
      lifespanDays: 300,
    },
  ],
  "sole@sneakers.test": [
    {
      brand: "Nike",
      model: "Air Jordan 1 Mid",
      size: "UK 9",
      category: "Basketball",
      value: "42000",
      lifespanDays: 365,
    },
    {
      brand: "Puma",
      model: "Suede Classic",
      size: "UK 7",
      category: "Lifestyle",
      value: "18000",
      lifespanDays: 350,
    },
    {
      brand: "Converse",
      model: "Chuck 70 Hi",
      size: "UK 8",
      category: "Lifestyle",
      value: "16000",
      lifespanDays: 300,
    },
    {
      brand: "Nike",
      model: "Dunk Low",
      size: "UK 10",
      category: "Lifestyle",
      value: "35000",
      lifespanDays: 380,
    },
    {
      brand: "Vans",
      model: "Old Skool",
      size: "UK 9",
      category: "Skate",
      value: "14000",
      lifespanDays: 250,
    },
  ],
};

async function main() {
  if (!(await db.pricingSettings.findFirst())) {
    await db.pricingSettings.create({ data: DEFAULT_SETTINGS });
    console.log("Created default pricing settings");
  }

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

    const shoes = shoesByMerchant[u.email];
    if (!shoes || !user.merchant) continue;
    if ((await db.shoe.count({ where: { merchantId: user.merchant.id } })) > 0) continue;
    for (const s of shoes) {
      await db.shoe.create({
        data: {
          ...s,
          merchantId: user.merchant.id,
          pickupAddress: `${u.businessName}, 12 Galle Road, Colombo 03`,
          status: "AVAILABLE",
          latestGrade: "A",
          publishedAt: new Date(),
        },
      });
    }
    console.log(`Seeded ${shoes.length} shoes for ${u.businessName}`);
  }
  console.log(`Seed complete. Dev password for all accounts: ${PASSWORD}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
