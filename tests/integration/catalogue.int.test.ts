import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  CatalogueError,
  browseShoes,
  createShoe,
  getListing,
  publishShoe,
  setLifespanExtension,
  shoeSchema,
  updatePayoutAccount,
} from "@/server/catalogue";
import { curvePreview, shoeCurve, shoePricing } from "@/server/catalogue/pricing";
import { getActiveSettings, toPricingSettings } from "@/server/settings";
import { PhotoError } from "@/server/storage";
import { colomboDay, dayToDate } from "@/lib/wear-ledger";
import { TEST_SETTINGS, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const photo = (type = "image/png", bytes: Uint8Array = PNG) =>
  new File([bytes as BlobPart], "p", { type });
const allPhotos = () => ({
  FRONT: photo(),
  SIDE: photo(),
  SOLE: photo(),
  INSIDE: photo(),
  BOX: photo(),
});

const LIMITS = { minLifespanDays: 183, maxLifespanDays: 730 };
const input = shoeSchema(LIMITS).parse({
  brand: "Nike",
  model: "Pegasus 41",
  size: "UK 9",
  category: "Running",
  pickupAddress: "12 Galle Road, Colombo",
  value: "6000",
  lifespanDays: "365",
});

describe("listing a shoe", () => {
  it("creates a draft with five photos, and publishes once the merchant is verified", async () => {
    const user = await makeUser("MERCHANT");
    const merchant = user.merchant!;
    const shoe = await createShoe(merchant.id, input, allPhotos());
    expect(shoe.status).toBe("DRAFT");
    expect(await db.photo.count({ where: { shoeId: shoe.id } })).toBe(5);
    expect(await getListing(shoe.id)).toBeNull(); // drafts are hidden

    await db.merchant.update({ where: { id: merchant.id }, data: { verified: false } });
    await expect(publishShoe(merchant.id, shoe.id)).rejects.toThrow(/verified/);

    await db.merchant.update({
      where: { id: merchant.id },
      data: { verified: true, payoutAccount: null },
    });
    await expect(publishShoe(merchant.id, shoe.id)).rejects.toThrow(/payout/);

    await updatePayoutAccount(merchant.id, "BOC 1234 5678");
    const published = await publishShoe(merchant.id, shoe.id);
    expect(published.status).toBe("AVAILABLE");
    expect(await getListing(shoe.id)).not.toBeNull();
    await expect(publishShoe(merchant.id, shoe.id)).rejects.toThrow(CatalogueError);
  });

  it("rejects missing, wrong-type and oversized photos", async () => {
    const { merchant } = await makeUser("MERCHANT");
    const { BOX: _box, ...missingBox } = allPhotos();
    await expect(createShoe(merchant!.id, input, missingBox)).rejects.toThrow(/Box/);
    await expect(
      createShoe(merchant!.id, input, { ...allPhotos(), SOLE: photo("image/gif") }),
    ).rejects.toThrow(PhotoError);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    await expect(
      createShoe(merchant!.id, input, { ...allPhotos(), FRONT: photo("image/png", big) }),
    ).rejects.toThrow(/5 MB/);
    expect(await db.shoe.count()).toBe(0);
  });

  it("doesn't let one merchant publish another merchant's shoe", async () => {
    const owner = await makeUser("MERCHANT");
    const other = await makeUser("MERCHANT");
    const shoe = await createShoe(owner.merchant!.id, input, allPhotos());
    await expect(publishShoe(other.merchant!.id, shoe.id)).rejects.toThrow(/not found/);
  });

  it("validates lifespan bounds from settings, value format and wear used", () => {
    const schema = shoeSchema(LIMITS);
    expect(schema.safeParse({ ...input, lifespanDays: "182" }).success).toBe(false);
    expect(schema.safeParse({ ...input, lifespanDays: "731" }).success).toBe(false);
    expect(schema.safeParse({ ...input, lifespanDays: "183" }).success).toBe(true);
    expect(schema.safeParse({ ...input, lifespanDays: "730" }).success).toBe(true);
    expect(schema.safeParse({ ...input, value: "6,000" }).success).toBe(false);
    expect(schema.safeParse({ ...input, value: "0" }).success).toBe(false);
    expect(schema.safeParse({ ...input, initialWear: "365" }).success).toBe(false);
    expect(schema.safeParse({ ...input, initialWear: "abc" }).success).toBe(false);
    expect(schema.parse({ ...input, initialWear: "" }).initialWear).toBe("0");
  });

  it("rejects a lifespan the active settings no longer allow", async () => {
    const { merchant } = await makeUser("MERCHANT");
    await db.pricingSettings.create({ data: { ...TEST_SETTINGS, minLifespanDays: 400 } });
    await expect(createShoe(merchant!.id, input, allPhotos())).rejects.toThrow(/between 400/);
  });

  it("lifespans are 6–24 months unless an admin extends the merchant's limit", async () => {
    const { merchant } = await makeUser("MERCHANT");
    const long = { ...input, lifespanDays: 1095 }; // 36 months
    await expect(createShoe(merchant!.id, long, allPhotos())).rejects.toThrow(/183 and 730/);

    await expect(setLifespanExtension(merchant!.id, 24)).rejects.toThrow(/more than 24 months/);
    await setLifespanExtension(merchant!.id, 36);
    expect(
      (await db.merchant.findUniqueOrThrow({ where: { id: merchant!.id } })).maxLifespanDays,
    ).toBe(1095);
    const shoe = await createShoe(merchant!.id, long, allPhotos());
    expect(shoe.lifespanDays).toBe(1095);
    await expect(
      createShoe(merchant!.id, { ...input, lifespanDays: 1096 }, allPhotos()),
    ).rejects.toThrow(/183 and 1095/);

    // Removing the extension blocks new long listings; the listed shoe keeps its curve.
    await setLifespanExtension(merchant!.id, null);
    await expect(createShoe(merchant!.id, long, allPhotos())).rejects.toThrow(/183 and 730/);
    await expect(publishShoe(merchant!.id, shoe.id)).rejects.toThrow(/183 and 730/);
    const stored = await db.shoe.findUniqueOrThrow({
      where: { id: shoe.id },
      include: { settings: true },
    });
    expect(shoePricing(stored).priceNew.startsWith("9.64")).toBe(true); // 28.92 / 3
  });

  it("lists a second-hand pair at its declared wear", async () => {
    const { merchant } = await makeUser("MERCHANT");
    const shoe = await createShoe(merchant!.id, { ...input, initialWear: "120.5" }, allPhotos());
    expect(shoe.wear.toString()).toBe("120.5");
    expect(shoe.initialWear.toString()).toBe("120.5");
    expect(shoe.collectedSoFar.toString()).toBe("0");
  });

  it("prices a shoe with the settings version active when it was published", async () => {
    const user = await makeUser("MERCHANT");
    const shoe = await createShoe(user.merchant!.id, input, allPhotos());
    // Margins change before publishing: the shoe takes the new version when published.
    const v2 = await db.pricingSettings.create({
      data: {
        ...TEST_SETTINGS,
        merchantMargin: "0.15",
        effectiveFrom: new Date(Date.now() - 1000),
      },
    });
    const published = await publishShoe(user.merchant!.id, shoe.id);
    expect(published.settingsId).toBe(v2.id);
    // A later change doesn't move a listed shoe's curve.
    await db.pricingSettings.create({ data: { ...TEST_SETTINGS, merchantMargin: "0.30" } });
    const listed = await getListing(shoe.id);
    const { params } = shoeCurve(listed!);
    expect(params.R.toString()).toBe("7500"); // (1 + 0.15 + 0.10) × 6,000
  });
});

describe("browsing and prices", () => {
  it("shows available and handoff-reservable shoes from verified merchants, with filters", async () => {
    const verified = await makeUser("MERCHANT");
    const unverified = await makeUser("MERCHANT");
    await db.merchant.update({ where: { id: unverified.merchant!.id }, data: { verified: false } });
    const { id: settingsId } = await getActiveSettings();
    const base = { ...input, pickupAddress: input.pickupAddress, description: null, settingsId };
    await db.shoe.createMany({
      data: [
        { ...base, merchantId: verified.merchant!.id, status: "AVAILABLE", size: "UK 9" },
        {
          ...base,
          merchantId: verified.merchant!.id,
          status: "WITH_BORROWER",
          size: "UK 10",
          brand: "Adidas",
          // Held, ending in 5 days: reservable next.
          releaseDay: dayToDate(colomboDay(new Date()) + 5),
        },
        {
          ...base,
          merchantId: verified.merchant!.id,
          status: "WITH_BORROWER",
          brand: "Puma",
          // Held for 30 more days: reservable next too, from the holder's day 1.
          releaseDay: dayToDate(colomboDay(new Date()) + 30),
        },
        { ...base, merchantId: verified.merchant!.id, status: "DRAFT" },
        { ...base, merchantId: verified.merchant!.id, status: "RETIRED" },
        { ...base, merchantId: unverified.merchant!.id, status: "AVAILABLE" },
      ],
    });
    expect(await browseShoes({})).toHaveLength(3);
    expect(await browseShoes({ size: "UK 10" })).toHaveLength(1);
    expect(await browseShoes({ q: "adi" })).toHaveLength(1);
    expect(await browseShoes({ brand: "Puma" })).toHaveLength(1);
  });

  it("prices the 6,000 LKR / 365-day shoe at 28.9248 new and 8.6774 at end of life", async () => {
    const row = await getActiveSettings();
    const settings = toPricingSettings(row);
    const shoe = {
      value: "6000",
      lifespanDays: 365,
      initialWear: "0",
      collectedSoFar: "0",
      merchantCollected: "0",
    };
    const pricing = shoePricing({ ...shoe, wear: "0", settings: row });
    expect(pricing.priceToday.slice(0, 7)).toBe("28.9247");
    expect(pricing.priceEnd.slice(0, 6)).toBe("8.6774");
    expect(pricing.lifeLeft).toBe("1");
    expect(pricing.merchantTarget).toBe("6600");
    const worn = shoePricing({ ...shoe, wear: "73", settings: row });
    expect(worn.lifeLeft).toBe("0.8");
    const preview = curvePreview("6000", 365, settings);
    expect(preview.lifetimeIncome).toBe("7200");
    expect(preview.merchantShare).toBe("6600");
    expect(preview.platformShare).toBe("600");
    expect(preview.points).toHaveLength(61);
  });
});
