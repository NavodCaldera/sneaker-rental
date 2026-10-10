import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import type { Role } from "@/generated/prisma/client";

/** Launch defaults, as in prisma/seed.ts. */
export const TEST_SETTINGS = {
  merchantMargin: "0.10",
  platformMargin: "0.10",
  floor: "0.30",
  midpointRatio: "0.5479452054794521",
  baseSteepness: "0.03",
  idleDiscountCap: "0.05",
  depositPerPair: "5000",
  maxPairsPerBundle: 4,
  disputeWindowDays: 3,
  freeReturnHours: 24,
};

/** Empty every table and restore default settings. */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
    await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
  }
  await db.pricingSettings.create({
    data: { ...TEST_SETTINGS, effectiveFrom: new Date("2020-01-01") },
  });
}

let counter = 0;
let cachedHash: string | undefined;

export async function makeUser(role: Role, overrides: { email?: string; name?: string } = {}) {
  cachedHash ??= await hashPassword("password123");
  counter += 1;
  return db.user.create({
    data: {
      role,
      name: overrides.name ?? `${role.toLowerCase()} ${counter}`,
      email: overrides.email ?? `${role.toLowerCase()}${counter}@test.local`,
      passwordHash: cachedHash,
      verified: true,
      merchant:
        role === "MERCHANT"
          ? { create: { businessName: `Shop ${counter}`, verified: true, payoutAccount: "ACC" } }
          : undefined,
    },
    include: { merchant: true },
  });
}
