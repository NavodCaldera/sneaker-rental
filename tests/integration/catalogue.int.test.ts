import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  CatalogueError,
  browseShoes,
  createShoe,
  getListing,
  publishShoe,
  shoeSchema,
  updatePayoutAccount,
} from "@/server/catalogue";
import { curvePreview, shoePricing } from "@/server/catalogue/pricing";
import { getActiveSettings, toPricingSettings } from "@/server/settings";
import { PhotoError } from "@/server/storage";
import { makeUser, resetDb } from "./helpers";

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

const input = shoeSchema.parse({
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

  it("validates lifespan bounds and value format", () => {
    expect(shoeSchema.safeParse({ ...input, lifespanDays: "10" }).success).toBe(false);
    expect(shoeSchema.safeParse({ ...input, lifespanDays: "5000" }).success).toBe(false);
    expect(shoeSchema.safeParse({ ...input, value: "6,000" }).success).toBe(false);
    expect(shoeSchema.safeParse({ ...input, value: "0" }).success).toBe(false);
  });
});

describe("browsing and prices", () => {
  it("shows available and handoff-reservable shoes from verified merchants, with filters", async () => {
    const verified = await makeUser("MERCHANT");
    const unverified = await makeUser("MERCHANT");
    await db.merchant.update({ where: { id: unverified.merchant!.id }, data: { verified: false } });
    const base = { ...input, pickupAddress: input.pickupAddress, description: null };
    await db.shoe.createMany({
      data: [
        { ...base, merchantId: verified.merchant!.id, status: "AVAILABLE", size: "UK 9" },
        {
          ...base,
          merchantId: verified.merchant!.id,
          status: "WITH_BORROWER",
          size: "UK 10",
          brand: "Adidas",
        },
        { ...base, merchantId: verified.merchant!.id, status: "DRAFT" },
        { ...base, merchantId: verified.merchant!.id, status: "RETIRED" },
        { ...base, merchantId: unverified.merchant!.id, status: "AVAILABLE" },
      ],
    });
    expect(await browseShoes({})).toHaveLength(2);
    expect(await browseShoes({ size: "UK 10" })).toHaveLength(1);
    expect(await browseShoes({ q: "adi" })).toHaveLength(1);
    expect(await browseShoes({ brand: "Puma" })).toHaveLength(0);
  });

  it("prices the 6,000 LKR / 365-day shoe at 28.9248 new and 8.6774 at end of life", async () => {
    const settings = toPricingSettings(await getActiveSettings());
    const pricing = shoePricing({ value: "6000", lifespanDays: 365, wear: "0" }, settings);
    expect(pricing.priceToday.slice(0, 7)).toBe("28.9247");
    expect(pricing.priceEnd.slice(0, 6)).toBe("8.6774");
    const preview = curvePreview("6000", 365, settings);
    expect(preview.lifetimeIncome).toBe("7200");
    expect(preview.merchantShare).toBe("6600");
    expect(preview.platformShare).toBe("600");
    expect(preview.points).toHaveLength(61);
  });
});
