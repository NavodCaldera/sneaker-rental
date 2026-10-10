import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import type { Delivery, Role } from "@/generated/prisma/client";
import { onDeliveryDelivered, onDeliveryPickedUp } from "@/server/booking/lifecycle";

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

export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
export const photos = () => [new File([PNG as BlobPart], "c.png", { type: "image/png" })];
/** Noon in Colombo, `n` days after 1 Jan 2026. */
export const day = (n: number) =>
  new Date(Date.parse("2026-01-01T12:00:00+05:30") + n * 86_400_000);

export async function makeShoe(
  merchantId: string,
  overrides: { value?: string; lifespanDays?: number } = {},
) {
  return db.shoe.create({
    data: {
      merchantId,
      brand: "Nike",
      model: "Pegasus 41",
      size: "UK 9",
      category: "Running",
      pickupAddress: "Shop, 12 Galle Road, Colombo 03",
      value: overrides.value ?? "6000",
      lifespanDays: overrides.lifespanDays ?? 365,
      status: "AVAILABLE",
    },
  });
}

export async function deliveryFor(itemId: string, type: Delivery["type"]) {
  return db.delivery.findFirstOrThrow({ where: { rentalItemId: itemId, type } });
}

export async function arrive(delivery: Delivery, at: Date) {
  await db.$transaction(async (tx) => {
    await onDeliveryPickedUp(tx, delivery);
    await tx.delivery.update({
      where: { id: delivery.id },
      data: { status: "DELIVERED", deliveredAt: at },
    });
    await onDeliveryDelivered(tx, { ...delivery, status: "DELIVERED" }, at);
  });
}

export async function setup() {
  const merchant = await makeUser("MERCHANT");
  const borrower = await makeUser("BORROWER");
  return { merchant, merchantId: merchant.merchant!.id, borrower };
}
