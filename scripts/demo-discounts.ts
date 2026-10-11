/**
 * Development data: real rentals that leave some sample pairs with a release discount, so the
 * home page's "Exceptional Value" row has pairs in it. Every step goes through the app's own
 * services (checkout, deliveries, the daily job, the merchant's condition check) with past
 * dates, so wallets, rent, merchant shares and notices are all consistent.
 *
 * Run after `npm run db:seed`: `npm run db:demo-discounts`. Dates are relative to today, so
 * the discounts are current whenever it runs. Pairs already rented are skipped. The seed creates
 * everything "now", so first the sample marketplace is dated back to a launch 60 days ago
 * (accounts, merchants, the first settings version, sample listings and starting tokens):
 * pairs can't be rented before they were listed.
 *
 * - Amaya rents the Puma Suede Classic and the Adidas Samba OG for 30 days, ending in 5 days:
 *   both are "Reserve next" with a small discount.
 * - Ravi rents the Vans Old Skool for 14 days, ending in 2 days: a bigger discount.
 * - Nimal rented the Converse Chuck 70 Hi for 21 days, ending 3 days ago; it was collected,
 *   checked (grade A), his rent charged and the pair cleaned: it is available again at a bigger
 *   discount still.
 */
import "dotenv/config";
import { colomboDay, dayToDate } from "../src/lib/wear-ledger";
import { checkout } from "../src/server/booking/checkout";
import { runDailyRentals } from "../src/server/booking/daily";
import {
  markCleaned,
  onDeliveryDelivered,
  onDeliveryPickedUp,
  recordCondition,
} from "../src/server/booking/lifecycle";
import { db } from "../src/server/db";

const today = colomboDay(new Date());
/** Noon in Colombo, `offset` days from today. */
const at = (offset: number) => new Date(dayToDate(today + offset).getTime() + 6.5 * 3_600_000);

// 1×1 PNG, as the merchant's condition photo
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function user(email: string) {
  return db.user.findUniqueOrThrow({ where: { email } });
}

/** The sample pair, or null if it has been rented before (this script already ran). */
async function freshPair(brand: string, model: string) {
  const shoe = await db.shoe.findFirst({
    where: { brand, model },
    include: { _count: { select: { rentalItems: true } } },
  });
  if (!shoe) throw new Error(`Sample pair ${brand} ${model} not found: run npm run db:seed`);
  return shoe.status === "AVAILABLE" && shoe._count.rentalItems === 0 ? shoe : null;
}

/** A driver picks up and delivers one trip (what the admin's trip updates do). */
async function deliver(itemId: string, type: "DELIVER" | "COLLECT", when: Date) {
  const delivery = await db.delivery.findFirstOrThrow({ where: { rentalItemId: itemId, type } });
  await db.$transaction(async (tx) => {
    await onDeliveryPickedUp(tx, delivery);
    const done = await tx.delivery.update({
      where: { id: delivery.id },
      data: { status: "DELIVERED", deliveredAt: when },
    });
    await onDeliveryDelivered(tx, done, when);
  });
}

async function rent(
  email: string,
  pairs: [string, string][],
  plannedDays: number,
  bookedDay: number,
) {
  const shoes = await Promise.all(pairs.map(([b, m]) => freshPair(b, m)));
  if (shoes.some((s) => !s)) {
    console.log(`Skipped ${email}: ${pairs.map((p) => p.join(" ")).join(", ")} already rented`);
    return null;
  }
  const borrower = await user(email);
  const rental = await checkout(
    borrower.id,
    shoes.map((s) => s!.id),
    { plannedDays },
    at(bookedDay),
  );
  const items = await db.rentalItem.findMany({ where: { rentalId: rental.id } });
  // Delivered the day after booking; day 1 is the day after delivery.
  for (const item of items) await deliver(item.id, "DELIVER", at(bookedDay + 1));
  console.log(
    `${borrower.name} rents ${pairs.map((p) => p.join(" ")).join(" and ")} for ${plannedDays} days`,
  );
  return items;
}

const SAMPLE_EMAILS = [
  "admin@sneakers.test",
  "kicks@sneakers.test",
  "sole@sneakers.test",
  "amaya@sneakers.test",
  "ravi@sneakers.test",
  "nimal@sneakers.test",
];

/** Moves the seeded sample data's dates back to `launch` (only what is later than it). */
async function datebackSampleData(launch: Date) {
  const later = { gt: launch };
  const users = await db.user.findMany({ where: { email: { in: SAMPLE_EMAILS } } });
  const userIds = users.map((u) => u.id);
  const first = await db.pricingSettings.findFirst({ orderBy: { effectiveFrom: "asc" } });
  if (!first) throw new Error("No pricing settings: run npm run db:seed first");
  await db.$transaction([
    db.user.updateMany({
      where: { id: { in: userIds }, createdAt: later },
      data: { createdAt: launch },
    }),
    db.merchant.updateMany({
      where: { userId: { in: userIds }, createdAt: later },
      data: { createdAt: launch },
    }),
    // The first settings version is the one the sample pairs were listed under.
    db.pricingSettings.updateMany({
      where: { id: first.id, effectiveFrom: later },
      data: { effectiveFrom: launch, createdAt: launch },
    }),
    db.shoe.updateMany({
      where: { merchant: { userId: { in: userIds } }, settingsId: first.id, createdAt: later },
      data: { createdAt: launch, publishedAt: launch },
    }),
    db.walletEntry.updateMany({
      where: { userId: { in: userIds }, idempotencyKey: { startsWith: "seed:" }, createdAt: later },
      data: { createdAt: launch },
    }),
  ]);
}

async function main() {
  await datebackSampleData(at(-60));
  // Nimal: 21 days, delivered 24 days ago, so the term's last day was 3 days ago.
  const nimal = await rent("nimal@sneakers.test", [["Converse", "Chuck 70 Hi"]], 21, -25);
  await rent(
    "amaya@sneakers.test",
    [
      ["Puma", "Suede Classic"],
      ["Adidas", "Samba OG"],
    ],
    30,
    -26,
  );
  await rent("ravi@sneakers.test", [["Vans", "Old Skool"]], 14, -13);

  if (nimal) {
    // The daily job ends Nimal's term; a driver brings the pair back; the merchant checks it.
    await runDailyRentals(at(-2));
    const [item] = nimal;
    await deliver(item.id, "COLLECT", at(-2));
    const shoe = await db.shoe.findUniqueOrThrow({
      where: { id: item.shoeId },
      include: { merchant: true },
    });
    await recordCondition(
      shoe.merchant.userId,
      {
        itemId: item.id,
        grade: "A",
        photos: [new File([PNG], "returned.png", { type: "image/png" })],
      },
      at(-2),
    );
    console.log("Nimal's pair is back with the merchant, checked and his rent charged");
  }
  // The merchant cleans it and puts it back on sale.
  const returned = await db.shoe.findFirst({
    where: { brand: "Converse", model: "Chuck 70 Hi", status: "CLEANING" },
  });
  if (returned) {
    await markCleaned(returned.merchantId, returned.id);
    console.log("Converse Chuck 70 Hi is cleaned and available again");
  }
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
