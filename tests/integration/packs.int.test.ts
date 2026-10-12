import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  PackError,
  createPack,
  deletePack,
  getPackForEdit,
  listPacks,
  packBundlePicks,
  packForViewer,
  packSchema,
  parsePackForm,
  publishPack,
  publishedPacks,
  rejectPack,
  submitPack,
  unpublishPack,
  updatePack,
  withdrawPack,
} from "@/server/packs";
import { makeShoe, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

async function setup() {
  const merchant = await makeUser("MERCHANT");
  const other = await makeUser("MERCHANT");
  const admin = await makeUser("ADMIN");
  // Pairs from two merchants: a pack may use any merchant's pairs.
  const mine = await makeShoe(merchant.merchant!.id);
  const theirs = await makeShoe(other.merchant!.id);
  const spare = await makeShoe(other.merchant!.id);
  const input = packSchema.parse({
    title: "The Marathon & Active Recovery",
    subtitle: "Tempo runs and recovery days",
    highlight: "Hold 2 pairs · wear splits 2 ways",
    roles: [
      { name: "Daily Mileage", experience: "Morning Run", shoeIds: [mine.id, spare.id] },
      { name: "Recovery", shoeIds: [theirs.id] },
    ],
  });
  return { merchant, other, admin, mine, theirs, spare, input };
}

describe("style packs", () => {
  it("a merchant's pack is a draft until an admin approves it, then borrowers see it", async () => {
    const { merchant, admin, input } = await setup();
    const pack = await createPack(merchant, input);
    expect(pack.status).toBe("DRAFT");
    expect(await publishedPacks()).toHaveLength(0);
    // Not visible to the public yet, but its maker and admins can preview it.
    expect(await packForViewer(pack.id, null)).toBeNull();
    expect(await packForViewer(pack.id, merchant)).not.toBeNull();
    expect(await packForViewer(pack.id, admin)).not.toBeNull();

    // An admin can't publish a merchant's pack before it's sent for review.
    await expect(publishPack(admin, pack.id)).rejects.toThrow(/hasn't sent/);
    await submitPack(merchant, pack.id);
    await expect(publishPack(merchant, pack.id)).rejects.toThrow(PackError);
    await publishPack(admin, pack.id);

    const [shown] = await publishedPacks();
    expect(shown.title).toBe("The Marathon & Active Recovery");
    expect(shown.roles.map((r) => [r.name, r.pairs.length])).toEqual([
      ["Daily Mileage", 2],
      ["Recovery", 1],
    ]);
    // Prices come from the engine: the 6,000 LKR / 365-day pair costs 28.92 new.
    expect(shown.roles[0].pairs[0].priceToday.slice(0, 5)).toBe("28.92");
    // Two new pairs held together cost about one pair's price a day.
    expect(shown.rotationDailyCost!.slice(0, 5)).toBe("28.92");
    const notice = await db.notification.findFirstOrThrow({ where: { userId: merchant.id } });
    expect([notice.kind, notice.title]).toEqual([
      "STYLE_PACK",
      'Your style pack "The Marathon & Active Recovery" is live',
    ]);
  });

  it("an admin rejects with a reason; the merchant edits and sends it again", async () => {
    const { merchant, admin, input } = await setup();
    const pack = await createPack(merchant, input);
    await submitPack(merchant, pack.id);
    await expect(rejectPack(admin, pack.id, "")).rejects.toThrow();
    const rejected = await rejectPack(admin, pack.id, "Add a recovery pair for women.");
    expect([rejected.status, rejected.reviewNote]).toEqual([
      "REJECTED",
      "Add a recovery pair for women.",
    ]);
    const notice = await db.notification.findFirstOrThrow({ where: { userId: merchant.id } });
    expect(notice.body).toMatch(/Add a recovery pair for women\./);
    await updatePack(merchant, pack.id, { ...input, title: "Marathon Rotation" });
    expect((await submitPack(merchant, pack.id)).status).toBe("SUBMITTED");
  });

  it("editing a published merchant pack sends it back for review; an admin's edit doesn't", async () => {
    const { merchant, admin, input } = await setup();
    const pack = await createPack(merchant, input);
    await submitPack(merchant, pack.id);
    await publishPack(admin, pack.id);
    const edited = await updatePack(merchant, pack.id, { ...input, subtitle: "New words" });
    expect(edited.status).toBe("SUBMITTED");
    expect(await publishedPacks()).toHaveLength(0);
    await publishPack(admin, pack.id);
    const byAdmin = await updatePack(admin, pack.id, { ...input, subtitle: "Admin words" });
    expect(byAdmin.status).toBe("PUBLISHED");
  });

  it("an admin can publish their own pack straight away, and unpublish any pack", async () => {
    const { merchant, admin, input } = await setup();
    const own = await createPack(admin, input, { publish: true });
    expect(own.status).toBe("PUBLISHED");
    const draft = await createPack(admin, input);
    expect((await publishPack(admin, draft.id)).status).toBe("PUBLISHED");
    expect(await publishedPacks()).toHaveLength(2);

    const theirs = await createPack(merchant, input);
    await submitPack(merchant, theirs.id);
    await publishPack(admin, theirs.id);
    const off = await unpublishPack(admin, theirs.id, "Two pairs are out of season.");
    expect([off.status, off.reviewNote]).toEqual(["DRAFT", "Two pairs are out of season."]);
    const notices = await db.notification.findMany({
      where: { userId: merchant.id },
      orderBy: { createdAt: "asc" },
    });
    expect(notices.at(-1)!.title).toMatch(/taken off the site/);
  });

  it("merchants manage only their own packs; admins manage all", async () => {
    const { merchant, other, admin, input } = await setup();
    const pack = await createPack(merchant, input);
    await expect(updatePack(other, pack.id, input)).rejects.toThrow(/not found/);
    await expect(deletePack(other, pack.id)).rejects.toThrow(/not found/);
    await expect(getPackForEdit(other, pack.id)).rejects.toThrow(/not found/);
    await createPack(other, input);
    expect((await listPacks(merchant)).map((p) => p.id)).toEqual([pack.id]);
    expect(await listPacks(admin)).toHaveLength(2);
    const { input: loaded } = await getPackForEdit(admin, pack.id);
    expect(loaded).toEqual(input);
    const borrower = await makeUser("BORROWER");
    await expect(createPack(borrower, input)).rejects.toThrow(/merchants and admins/);
    await deletePack(admin, pack.id);
    expect(await listPacks(merchant)).toHaveLength(0);
  });

  it("a merchant can withdraw a pack from review or from the site", async () => {
    const { merchant, admin, input } = await setup();
    const pack = await createPack(merchant, input);
    await expect(withdrawPack(merchant, pack.id)).rejects.toThrow(PackError);
    await submitPack(merchant, pack.id);
    expect((await withdrawPack(merchant, pack.id)).status).toBe("DRAFT");
    await submitPack(merchant, pack.id);
    await publishPack(admin, pack.id);
    expect((await withdrawPack(merchant, pack.id)).status).toBe("DRAFT");
    expect(await publishedPacks()).toHaveLength(0);
  });

  it("only listed pairs can be used; pairs that leave the catalogue drop out of the pack", async () => {
    const { merchant, admin, mine, theirs, spare, input } = await setup();
    const draftShoe = await makeShoe(merchant.merchant!.id);
    await db.shoe.update({ where: { id: draftShoe.id }, data: { status: "DRAFT" } });
    await expect(
      createPack(merchant, {
        ...input,
        roles: [{ name: "Draft", description: "", experience: "", shoeIds: [draftShoe.id] }],
      }),
    ).rejects.toThrow(/aren't listed/);

    const pack = await createPack(admin, input, { publish: true });
    await db.shoe.update({ where: { id: theirs.id }, data: { status: "RETIRED" } });
    const [shown] = await publishedPacks();
    expect(shown.roles.map((r) => r.name)).toEqual(["Daily Mileage"]);

    // Adding the rotation to a bundle takes one bookable pair per role.
    await db.shoe.update({ where: { id: mine.id }, data: { status: "CLEANING" } });
    expect(await packBundlePicks(pack.id)).toEqual([spare.id]);
  });

  it("validates the form: title, 1–8 roles, 1–4 pairs per role, experiences from the list", async () => {
    const { mine } = await setup();
    const form = (roles: unknown, title = "City Explorer") => {
      const f = new FormData();
      f.set("title", title);
      f.set("roles", JSON.stringify(roles));
      return parsePackForm(f);
    };
    const role = { name: "Low-top", shoeIds: [mine.id] };
    expect(form([role]).success).toBe(true);
    expect(form([role], "ab").success).toBe(false);
    expect(form([]).success).toBe(false);
    expect(form(Array(9).fill(role)).success).toBe(false);
    expect(form([{ ...role, shoeIds: [] }]).success).toBe(false);
    expect(form([{ ...role, shoeIds: ["a", "b", "c", "d", "e"] }]).success).toBe(false);
    expect(form([{ ...role, experience: "Moon Walk" }]).success).toBe(false);
    // Duplicate pairs in a role are dropped; a broken roles field is an error, not a crash.
    expect(form([{ ...role, shoeIds: [mine.id, mine.id] }]).data!.roles[0].shoeIds).toEqual([
      mine.id,
    ]);
    const broken = new FormData();
    broken.set("title", "City Explorer");
    broken.set("roles", "{not json");
    expect(parsePackForm(broken).success).toBe(false);
  });
});
