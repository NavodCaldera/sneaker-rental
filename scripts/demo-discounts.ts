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
 * Every shopping tab gets at least one discounted pair (product owner, 2026-10-12): Men and
 * Women (the Vans and the Puma, plus the unisex Converse and Samba, which show under both),
 * Boys (Nike Air Force 1 Kids) and Girls (Skechers Twinkle Toes). See RENTALS below. Pairs still
 * out are "Reserve next" with a small discount; returned ones were collected, checked (grade A),
 * the rent charged and the pair cleaned, so they are available at a bigger discount.
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

type DemoRental = {
  email: string;
  /** For whom, so every shopping tab has a discounted pair */
  forTab: string;
  pairs: [string, string][];
  plannedDays: number;
  /** Days from today it was booked; delivered the next day, day 1 the day after that */
  bookedDay: number;
  /** Returned at the end of the term (collected, checked and cleaned), or still out */
  returned: boolean;
};

/**
 * The term's last day, in days from today: booked + 1 (delivery) + plannedDays. Each
 * customer's rentals are booked in date order, after their earlier ones, so a rerun that adds
 * a rental never books before something already in the database.
 */
const lastDayOf = (r: DemoRental) => r.bookedDay + 1 + r.plannedDays;

const RENTALS: DemoRental[] = [
  // Ends in 5 days: "Reserve next", small discount (Women, and Men/Women for the unisex Samba)
  {
    email: "amaya@sneakers.test",
    forTab: "Women",
    pairs: [
      ["Puma", "Suede Classic"],
      ["Adidas", "Samba OG"],
    ],
    plannedDays: 30,
    bookedDay: -26,
    returned: false,
  },
  // Came back 3 days ago: available, bigger discount (unisex: Men and Women)
  {
    email: "nimal@sneakers.test",
    forTab: "Men and Women",
    pairs: [["Converse", "Chuck 70 Hi"]],
    plannedDays: 21,
    bookedDay: -25,
    returned: true,
  },
  // A parent renting for their son: ends in 4 days
  {
    email: "ravi@sneakers.test",
    forTab: "Boys",
    pairs: [["Nike", "Air Force 1 Kids"]],
    plannedDays: 14,
    bookedDay: -11,
    returned: false,
  },
  // A parent renting for their daughter: came back 2 days ago
  {
    email: "amaya@sneakers.test",
    forTab: "Girls",
    pairs: [["Skechers", "Twinkle Toes"]],
    plannedDays: 14,
    bookedDay: -17,
    returned: true,
  },
  // Ends in 2 days
  {
    email: "ravi@sneakers.test",
    forTab: "Men",
    pairs: [["Vans", "Old Skool"]],
    plannedDays: 14,
    bookedDay: -13,
    returned: false,
  },
];

/** The daily job ends the term; a driver brings the pair back; the merchant checks it. */
async function bringBack(items: { id: string; shoeId: string }[], lastDay: number) {
  await runDailyRentals(at(lastDay + 1));
  for (const item of items) {
    await deliver(item.id, "COLLECT", at(lastDay + 1));
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
      at(lastDay + 1),
    );
  }
}

async function main() {
  await datebackSampleData(at(-60));
  const toReturn: { rental: DemoRental; items: { id: string; shoeId: string }[] }[] = [];
  for (const r of [...RENTALS].sort((a, b) => a.bookedDay - b.bookedDay)) {
    const items = await rent(r.email, r.pairs, r.plannedDays, r.bookedDay);
    if (items && r.returned) toReturn.push({ rental: r, items });
  }
  for (const { rental, items } of toReturn.sort(
    (a, b) => lastDayOf(a.rental) - lastDayOf(b.rental),
  )) {
    await bringBack(items, lastDayOf(rental));
    console.log(`${rental.pairs.map((p) => p.join(" ")).join(", ")} came back and was checked`);
  }
  // The merchant cleans returned pairs and puts them back on sale.
  for (const r of RENTALS.filter((x) => x.returned)) {
    for (const [brand, model] of r.pairs) {
      const shoe = await db.shoe.findFirst({ where: { brand, model, status: "CLEANING" } });
      if (!shoe) continue;
      await markCleaned(shoe.merchantId, shoe.id);
      console.log(`${brand} ${model} is cleaned and available again (${r.forTab})`);
    }
  }
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
