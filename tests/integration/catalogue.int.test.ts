import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  CatalogueError,
  browseFacets,
  browseShoes,
  createShoe,
  formFields,
  getListing,
  publishShoe,
  setLifespanExtension,
  shoeSchema,
  styleSchema,
  updatePayoutAccount,
  updatePricingMethod,
  updateShoeStyle,
} from "@/server/catalogue";
import { shoeName } from "@/lib/shoe-name";
import { curvePreview, shoeCurve, shoePricing } from "@/server/catalogue/pricing";
import { getActiveSettings, toPricingSettings } from "@/server/settings";
import { PhotoError } from "@/server/storage";
import { colomboDay, dayToDate } from "@/lib/wear-ledger";
import { shoeSizeFields } from "@/lib/shoe-size";
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
  sizeSystem: "UK",
  size: "9",
  audience: "MEN",
  experiences: ["Morning Run"],
  value: "6000",
  lifespanDays: "365",
  condition: "NEW",
});
const secondHand = { ...input, condition: "SECOND_HAND" as const };

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
    expect(schema.safeParse({ ...secondHand, initialWear: "365" }).success).toBe(false);
    expect(schema.safeParse({ ...secondHand, initialWear: "abc" }).success).toBe(false);
    expect(schema.parse({ ...input, initialWear: "" }).initialWear).toBe("0");
  });

  it("the declared condition must match the wear used, and upgrades must be described", () => {
    const schema = shoeSchema(LIMITS);
    const error = (data: object) =>
      schema.safeParse(data).error?.flatten().fieldErrors as Record<string, string[]>;
    expect(error({ ...input, condition: undefined }).condition).toEqual(["Choose the condition"]);
    expect(error({ ...input, initialWear: "10" }).initialWear).toEqual([
      "A brand-new pair has no wear used",
    ]);
    expect(error({ ...secondHand, initialWear: "" }).initialWear).toEqual([
      "Enter how many days the pair has been worn",
    ]);
    const upgraded = { ...input, condition: "SECOND_HAND_UPGRADED", initialWear: "60" };
    expect(error(upgraded).upgradeNotes).toEqual(["Say what was upgraded"]);
    expect(schema.parse({ ...upgraded, upgradeNotes: "New insoles" }).upgradeNotes).toBe(
      "New insoles",
    );
    expect(schema.safeParse({ ...secondHand, initialWear: "60" }).success).toBe(true);
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

  it("pairs are picked up from the merchant's one address: no address, no listing", async () => {
    const { merchant } = await makeUser("MERCHANT", { address: null });
    await expect(createShoe(merchant!.id, input, allPhotos())).rejects.toThrow(
      /pickup address in your account/,
    );
  });

  it("lists a second-hand pair at its declared wear", async () => {
    const { merchant } = await makeUser("MERCHANT");
    const shoe = await createShoe(
      merchant!.id,
      { ...secondHand, initialWear: "120.5", upgradeNotes: "ignored" },
      allPhotos(),
    );
    expect(shoe.wear.toString()).toBe("120.5");
    expect(shoe.initialWear.toString()).toBe("120.5");
    expect(shoe.collectedSoFar.toString()).toBe("0");
    expect([shoe.condition, shoe.upgradeNotes]).toEqual(["SECOND_HAND", null]);
  });

  it("stores an upgraded pair's condition and upgrades; the price still comes from its wear", async () => {
    const { merchant } = await makeUser("MERCHANT");
    const plain = await createShoe(merchant!.id, { ...secondHand, initialWear: "60" }, allPhotos());
    const upgraded = await createShoe(
      merchant!.id,
      {
        ...input,
        condition: "SECOND_HAND_UPGRADED",
        initialWear: "60",
        upgradeNotes: "New insoles and laces",
      },
      allPhotos(),
    );
    expect([upgraded.condition, upgraded.upgradeNotes]).toEqual([
      "SECOND_HAND_UPGRADED",
      "New insoles and laces",
    ]);
    const [a, b] = await Promise.all(
      [plain, upgraded].map((s) =>
        db.shoe.findUniqueOrThrow({ where: { id: s.id }, include: { settings: true } }),
      ),
    );
    expect(shoePricing(b).priceToday).toBe(shoePricing(a).priceToday);
    const brandNew = await createShoe(merchant!.id, input, allPhotos());
    expect(brandNew.condition).toBe("NEW");
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

  it("the merchant picks the pricing method: S-curve by default, changeable only as a draft", async () => {
    const schema = shoeSchema(LIMITS);
    expect(input.pricingMethod).toBe("LOGISTIC");
    expect(schema.parse({ ...input, pricingMethod: "EXPONENTIAL" }).pricingMethod).toBe(
      "EXPONENTIAL",
    );
    expect(schema.safeParse({ ...input, pricingMethod: "LINEAR" }).success).toBe(false);

    const user = await makeUser("MERCHANT");
    const other = await makeUser("MERCHANT");
    const merchantId = user.merchant!.id;
    const sCurve = await createShoe(merchantId, input, allPhotos());
    expect(sCurve.pricingMethod).toBe("LOGISTIC");
    const shoe = await createShoe(
      merchantId,
      { ...input, pricingMethod: "EXPONENTIAL" },
      allPhotos(),
    );
    expect(shoe.pricingMethod).toBe("EXPONENTIAL");

    // A draft can switch; another merchant can't touch it.
    await expect(updatePricingMethod(other.merchant!.id, shoe.id, "LOGISTIC")).rejects.toThrow(
      /not found/,
    );
    expect((await updatePricingMethod(merchantId, shoe.id, "LOGISTIC")).pricingMethod).toBe(
      "LOGISTIC",
    );
    await updatePricingMethod(merchantId, shoe.id, "EXPONENTIAL");

    // Published: priced on the exponential curve, and the method is fixed.
    await publishShoe(merchantId, shoe.id);
    await publishShoe(merchantId, sCurve.id);
    await expect(updatePricingMethod(merchantId, shoe.id, "LOGISTIC")).rejects.toThrow(
      /before publishing/,
    );
    const listed = await getListing(shoe.id);
    expect(listed!.pricingMethod).toBe("EXPONENTIAL");
    expect(shoeCurve(listed!).params.method).toBe("EXPONENTIAL");
    expect(shoePricing(listed!).priceToday.slice(0, 7)).toBe("33.9280");
    expect(shoePricing((await getListing(sCurve.id))!).priceToday.slice(0, 7)).toBe("28.9247");
  });
});

describe("browsing and prices", () => {
  it("shows available and handoff-reservable shoes from verified merchants, with filters", async () => {
    const verified = await makeUser("MERCHANT");
    const unverified = await makeUser("MERCHANT");
    await db.merchant.update({ where: { id: unverified.merchant!.id }, data: { verified: false } });
    const { id: settingsId } = await getActiveSettings();
    const base = {
      ...input,
      ...shoeSizeFields("MEN", "UK", "9"),
      description: null,
      settingsId,
    };
    await db.shoe.createMany({
      data: [
        { ...base, merchantId: verified.merchant!.id, status: "AVAILABLE" },
        {
          ...base,
          merchantId: verified.merchant!.id,
          status: "WITH_BORROWER",
          ...shoeSizeFields("MEN", "UK", "10"),
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

  it("finds a pair by its size in any system, however the merchant listed it", async () => {
    const user = await makeUser("MERCHANT");
    const womens = shoeSchema(LIMITS).parse({
      ...input,
      audience: "WOMEN",
      experiences: ["Night Out"],
      sizeSystem: "EU",
      size: "39",
    });
    const shoe = await createShoe(user.merchant!.id, womens, allPhotos());
    expect(shoe.size).toBe("EU 39");
    expect(shoe.sizeSystem).toBe("EU");
    expect([shoe.sizeUk, shoe.sizeEu, shoe.sizeUs, shoe.sizeCm].map((v) => v!.toString())).toEqual([
      "6",
      "39",
      "8.5",
      "24.5",
    ]);
    await db.shoe.update({ where: { id: shoe.id }, data: { status: "AVAILABLE" } });

    // A borrower who thinks "UK 6" finds the pair listed as EU 39; so do US 8.5 and 24.5 cm.
    for (const size of ["UK 6", "EU 39", "US 8.5", "24.5 cm", "uk6"]) {
      expect(await browseShoes({ size }), size).toHaveLength(1);
    }
    // US 6.5 is UK 6 on the men's chart, not the women's.
    expect(await browseShoes({ size: "US 6.5" })).toHaveLength(0);
    expect(await browseShoes({ size: "nonsense" })).toHaveLength(0);
    const facets = await browseFacets();
    expect(facets.sizes).toEqual({
      UK: ["UK 6"],
      EU: ["EU 39"],
      US: ["US 8.5"],
      CM: ["24.5 cm"],
    });

    // Changing who it's for re-reads the label size on the new chart.
    const mens = await updateShoeStyle(
      user.merchant!.id,
      shoe.id,
      styleSchema.parse({ audience: "MEN", experiences: ["Night Out"] }),
    );
    expect([mens.size, mens.sizeUk?.toString(), mens.sizeUs?.toString()]).toEqual([
      "EU 39",
      "6",
      "6.5",
    ]);
    // Kids' pairs keep only the size on the label.
    const kids = await updateShoeStyle(
      user.merchant!.id,
      shoe.id,
      styleSchema.parse({ audience: "GIRLS", experiences: ["Playtime"] }),
    );
    expect([kids.sizeEu?.toString(), kids.sizeUk, kids.sizeUs, kids.sizeCm]).toEqual([
      "39",
      null,
      null,
      null,
    ]);
  });

  it("takes the label size as a system and a whole or half number", () => {
    const sizeError = (v: Record<string, string>) =>
      shoeSchema(LIMITS)
        .safeParse({ ...input, ...v })
        .error?.flatten().fieldErrors;
    expect(sizeError({ size: "9.5" })).toBeUndefined();
    expect(sizeError({ size: "UK 9" })?.size).toEqual([
      "Enter the number on the label, e.g. 9 or 9.5",
    ]);
    expect(sizeError({ size: "9.3" })?.size).toBeDefined();
    expect(sizeError({ size: "0" })?.size).toEqual(["Enter a size from 1 to 60"]);
    expect(sizeError({ sizeSystem: "JP" })?.sizeSystem).toEqual(["Choose UK, EU or US"]);
  });

  it("shops by who it's for, then by experience; Unisex pairs show under Men and Women", async () => {
    const merchant = await makeUser("MERCHANT");
    const { id: settingsId } = await getActiveSettings();
    const base = {
      ...input,
      description: null,
      settingsId,
      merchantId: merchant.merchant!.id,
      status: "AVAILABLE" as const,
    };
    await db.shoe.createMany({
      data: [
        { ...base, brand: "M", audience: "MEN", experiences: ["Night Out"] },
        { ...base, brand: "W", audience: "WOMEN", experiences: ["Brunch & Errands"] },
        { ...base, brand: "U", audience: "UNISEX", experiences: ["Night Out"] },
        { ...base, brand: "B", audience: "BOYS", experiences: ["School Day"] },
        { ...base, brand: "G", audience: "GIRLS", experiences: ["Party Time"] },
      ],
    });
    const brands = async (f: Parameters<typeof browseShoes>[0]) =>
      (await browseShoes(f)).map((s) => s.brand).sort();
    expect(await brands({ audience: "MEN" })).toEqual(["M", "U"]);
    expect(await brands({ audience: "WOMEN" })).toEqual(["U", "W"]);
    expect(await brands({ audience: "BOYS" })).toEqual(["B"]);
    expect(await brands({ audience: "GIRLS" })).toEqual(["G"]);
    expect(await brands({ audience: "WOMEN", experience: "Night Out" })).toEqual(["U"]);
    expect(await brands({ experience: "Night Out" })).toEqual(["M", "U"]);
  });

  it("a pair can be made for several experiences and shows under each", async () => {
    const user = await makeUser("MERCHANT");
    const LIMITS = { minLifespanDays: 183, maxLifespanDays: 730 };
    const several = shoeSchema(LIMITS).parse({
      ...input,
      // Duplicates are dropped.
      experiences: ["Work Day", "Night Out", "Work Day"],
    });
    expect(several.experiences).toEqual(["Work Day", "Night Out"]);
    const shoe = await createShoe(user.merchant!.id, several, allPhotos());
    await publishShoe(user.merchant!.id, shoe.id);
    const ids = async (experience: string) => (await browseShoes({ experience })).map((s) => s.id);
    expect(await ids("Work Day")).toEqual([shoe.id]);
    expect(await ids("Night Out")).toEqual([shoe.id]);
    expect(await ids("Morning Run")).toEqual([]);
    // At least one, and every one from the audience's list.
    expect(shoeSchema(LIMITS).safeParse({ ...input, experiences: [] }).success).toBe(false);
    expect(
      shoeSchema(LIMITS).safeParse({ ...input, experiences: ["Work Day", "School Day"] }).success,
    ).toBe(false);
    // Forms send each ticked box as its own `experiences` field.
    const form = new FormData();
    form.append("audience", "MEN");
    form.append("experiences", "Work Day");
    form.append("experiences", "Game Day");
    expect(styleSchema.parse(formFields(form)).experiences).toEqual(["Work Day", "Game Day"]);
  });

  it("brand and model are optional; a pair with neither is listed as unbranded", async () => {
    const user = await makeUser("MERCHANT");
    const LIMITS = { minLifespanDays: 183, maxLifespanDays: 730 };
    const { brand: _b, model: _m, ...rest } = input;
    const parsed = shoeSchema(LIMITS).parse({ ...rest, brand: "  ", model: "" });
    expect([parsed.brand, parsed.model]).toEqual(["", ""]);
    expect(shoeSchema(LIMITS).parse(rest).brand).toBe("");
    const shoe = await createShoe(user.merchant!.id, parsed, allPhotos());
    const published = await publishShoe(user.merchant!.id, shoe.id);
    expect(published.status).toBe("AVAILABLE");
    expect(shoeName(published)).toBe("Unbranded shoes");
    expect(shoeName({ brand: "", model: "Air Max 90" })).toBe("Air Max 90");
    expect(shoeName({ brand: "Nike", model: "" })).toBe("Nike");
    expect(shoeName({ brand: "Nike", model: "Air Max 90" })).toBe("Nike Air Max 90");
    // Unbranded pairs aren't offered as a brand to filter by.
    expect((await browseFacets()).brands).not.toContain("");
  });

  it("accepts only an experience the audience offers, and the merchant can change it", async () => {
    const LIMITS = { minLifespanDays: 183, maxLifespanDays: 730 };
    const raw = { ...input, lifespanDays: "365" };
    expect(shoeSchema(LIMITS).safeParse({ ...raw, audience: "BOYS" }).success).toBe(false);
    expect(
      shoeSchema(LIMITS).safeParse({ ...raw, audience: "BOYS", experiences: ["School Day"] })
        .success,
    ).toBe(true);
    // Unisex pairs take any adult experience.
    expect(
      styleSchema.safeParse({ audience: "UNISEX", experiences: ["Studio & Gym"] }).success,
    ).toBe(true);
    expect(styleSchema.safeParse({ audience: "GIRLS", experiences: ["Work Day"] }).success).toBe(
      false,
    );

    const user = await makeUser("MERCHANT");
    const other = await makeUser("MERCHANT");
    const shoe = await createShoe(user.merchant!.id, input, allPhotos());
    const style = styleSchema.parse({ audience: "WOMEN", experiences: ["Big Occasion"] });
    await expect(updateShoeStyle(other.merchant!.id, shoe.id, style)).rejects.toThrow(
      CatalogueError,
    );
    const updated = await updateShoeStyle(user.merchant!.id, shoe.id, style);
    expect([updated.audience, updated.experiences]).toEqual(["WOMEN", ["Big Occasion"]]);
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
      pricingMethod: "LOGISTIC" as const,
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
    expect(preview.method).toBe("LOGISTIC");

    // Exponential decay: same lifetime income and shares, 33.9280 new and 10.1784 at the end.
    const exp = shoePricing({ ...shoe, pricingMethod: "EXPONENTIAL", wear: "0", settings: row });
    expect(exp.priceToday.slice(0, 7)).toBe("33.9280");
    expect(exp.priceEnd.slice(0, 7)).toBe("10.1784");
    expect(exp.lifetimeIncome).toBe("7200");
    expect(exp.merchantTarget).toBe("6600");
    const expPreview = curvePreview("6000", 365, settings, "EXPONENTIAL");
    expect(expPreview.method).toBe("EXPONENTIAL");
    expect(expPreview.priceNew.slice(0, 7)).toBe("33.9280");
    expect(expPreview.merchantShare).toBe("6600");
  });
});
