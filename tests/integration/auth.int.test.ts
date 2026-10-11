import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { requestPasswordReset, resetLinkWorks, resetPassword } from "@/server/auth/password-reset";
import { MockMailer, setMailerForTests } from "@/server/notify/mailer";
import {
  AuthError,
  authenticate,
  registerUser,
  signUpSchema,
  startSession,
  updateAddress,
  userForToken,
} from "@/server/auth/service";
import { getActiveSettings, toPricingSettings, updateSettings } from "@/server/settings";
import { makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

describe("sign-up and sign-in", () => {
  it("registers a merchant with a merchant profile, and signs in", async () => {
    const input = signUpSchema.parse({
      role: "MERCHANT",
      name: "Kasun",
      email: "  Kasun@Shop.LK ",
      password: "longenough",
      businessName: "Colombo Kicks",
      address: "Colombo Kicks, 12 Galle Road",
      city: "Colombo 03",
    });
    const user = await registerUser(input);
    expect(user.email).toBe("kasun@shop.lk");
    expect(user.passwordHash).not.toContain("longenough");
    expect(await db.merchant.count({ where: { userId: user.id } })).toBe(1);
    expect([user.address, user.city]).toEqual(["Colombo Kicks, 12 Galle Road", "Colombo 03"]);

    const signedIn = await authenticate("KASUN@shop.lk", "longenough");
    expect(signedIn.id).toBe(user.id);
  });

  it("asks customers and merchants for one address and its city, and lets them change them", async () => {
    const base = { name: "A B", email: "a@b.lk", password: "12345678" };
    const errors = (data: object) => signUpSchema.safeParse(data).error?.flatten().fieldErrors;
    expect(errors({ ...base, role: "BORROWER" })).toMatchObject({
      address: expect.any(Array),
      city: expect.any(Array),
    });
    expect(errors({ ...base, role: "BORROWER", address: "No 1", city: "Kandy" })?.address).toEqual([
      "Enter your house number and street",
    ]);
    expect(errors({ ...base, role: "BORROWER", address: "12 Galle Road", city: "" })?.city).toEqual(
      ["Enter your city"],
    );
    expect(
      errors({
        ...base,
        role: "MERCHANT",
        businessName: "Shop",
        address: "12 Galle Road",
        city: "Colombo 03",
      }),
    ).toBeUndefined();

    const user = await registerUser(
      signUpSchema.parse({
        ...base,
        role: "BORROWER",
        address: "  21/3 Hill Street ",
        city: " Dehiwala ",
        age: "33",
      }),
    );
    expect([user.address, user.city]).toEqual(["21/3 Hill Street", "Dehiwala"]);
    await updateAddress(user.id, "17 Temple Road", "Nugegoda");
    const moved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect([moved.address, moved.city]).toEqual(["17 Temple Road", "Nugegoda"]);
    await expect(updateAddress(user.id, "No 1", "Nugegoda")).rejects.toThrow(/house number/);
    await expect(updateAddress(user.id, "17 Temple Road", "")).rejects.toThrow(/city/);
    const token = (await startSession(user.id)).token;
    expect(await userForToken(token)).toMatchObject({
      address: "17 Temple Road",
      city: "Nugegoda",
    });
  });

  it("asks customers, not merchants, for their age", async () => {
    const customer = {
      role: "BORROWER",
      name: "A B",
      email: "age@b.lk",
      password: "12345678",
      address: "12 Galle Road",
      city: "Colombo 03",
    };
    const ageError = (age?: string) =>
      signUpSchema.safeParse({ ...customer, age }).error?.flatten().fieldErrors.age;
    expect(ageError()).toEqual(["Enter your age"]);
    expect(ageError("twenty")).toEqual(["Enter your age in whole years"]);
    expect(ageError("25.5")).toEqual(["Enter your age in whole years"]);
    expect(ageError("0")).toEqual(["Enter an age from 1 to 120"]);
    expect(ageError("121")).toEqual(["Enter an age from 1 to 120"]);
    expect(ageError(" 26 ")).toBeUndefined();

    const user = await registerUser(signUpSchema.parse({ ...customer, age: "26" }));
    expect(user.age).toBe(26);
    const token = (await startSession(user.id)).token;
    expect((await userForToken(token))?.age).toBe(26);

    // Merchants aren't asked; an age sent anyway isn't stored.
    const merchant = await registerUser(
      signUpSchema.parse({
        ...customer,
        role: "MERCHANT",
        email: "shop@b.lk",
        businessName: "Shop",
        age: "26",
      }),
    );
    expect(merchant.age).toBeNull();
  });

  it("requires a business name for merchants and rejects public admin sign-up", () => {
    expect(
      signUpSchema.safeParse({
        role: "MERCHANT",
        name: "A B",
        email: "a@b.lk",
        password: "12345678",
      }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({ role: "ADMIN", name: "A B", email: "a@b.lk", password: "12345678" })
        .success,
    ).toBe(false);
  });

  it("rejects duplicate emails, wrong passwords and locked accounts", async () => {
    const input = signUpSchema.parse({
      role: "BORROWER",
      name: "Amaya",
      email: "amaya@test.lk",
      password: "password123",
      address: "No. 8, Flower Road",
      city: "Colombo 07",
      age: "28",
    });
    const user = await registerUser(input);
    await expect(registerUser(input)).rejects.toThrow(AuthError);
    await expect(authenticate("amaya@test.lk", "wrong-password")).rejects.toThrow(AuthError);
    await expect(authenticate("nobody@test.lk", "password123")).rejects.toThrow(AuthError);

    await db.user.update({ where: { id: user.id }, data: { locked: true } });
    await expect(authenticate("amaya@test.lk", "password123")).rejects.toThrow(/locked/);
  });

  it("resolves a session token to its user until it expires", async () => {
    const user = await makeUser("BORROWER");
    const now = new Date();
    const { token } = await startSession(user.id, now);

    expect((await userForToken(token, now))?.id).toBe(user.id);
    expect(await userForToken("not-a-token", now)).toBeNull();
    const later = new Date(now.getTime() + 31 * 86_400_000);
    expect(await userForToken(token, later)).toBeNull();

    const stored = await db.session.findMany({ where: { userId: user.id } });
    expect(stored[0].id).not.toBe(token); // only the hash is stored
  });
});

describe("pricing settings", () => {
  it("uses the latest effective row and maps it for the pricing engine", async () => {
    const admin = await makeUser("ADMIN");
    const before = toPricingSettings(await getActiveSettings());
    expect(before.platformMargin).toBe("0.1");

    await updateSettings(
      {
        merchantMargin: "0.12",
        platformMargin: "0.08",
        floor: "0.30",
        midpointRatio: "0.5479452054794521",
        baseSteepness: "0.03",
        refLife: 365,
        minLifespanDays: 90,
        maxLifespanDays: 730,
        maxDiscount: "0.10",
        releaseLeadDays: 10,
        releaseDiscountStep: "0.005",
        capitalRate: "0.12",
        holdCost: "0",
        offerResponseHours: 24,
        earlyReturnNoticeDays: 10,
        maxPairsPerBundle: 4,
        disputeWindowDays: 3,
        freeReturnHours: 24,
        catchUpEnabled: false,
        chargePastLife: true,
      },
      admin.id,
    );
    const after = await getActiveSettings();
    expect(after.merchantMargin.toString()).toBe("0.12");
    expect(toPricingSettings(after)).toMatchObject({ minLife: 90, maxLife: 730, refLife: 365 });
    expect(await db.pricingSettings.count()).toBe(2); // append-only
  });
});

describe("forgot password", () => {
  let mail: MockMailer;
  beforeEach(() => {
    mail = new MockMailer();
    setMailerForTests(mail);
  });
  afterEach(() => setMailerForTests(undefined));

  const tokenOf = (link: string) => new URL(link).searchParams.get("token")!;

  it("emails a one-time link; the new password works, the old one and old sessions don't", async () => {
    const user = await makeUser("BORROWER", { email: "forgot@b.lk" });
    const session = await startSession(user.id);
    const now = new Date("2026-10-11T10:00:00Z");

    const sent = await requestPasswordReset(" Forgot@B.lk ", now);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe("forgot@b.lk");
    expect(mail.sent[0].subject).toBe("Reset your Shoe Rental password");
    expect(mail.sent[0].text).toContain(sent!.link);
    const token = tokenOf(sent!.link);
    // Only the hash is stored.
    expect(await db.passwordReset.count({ where: { id: token } })).toBe(0);
    expect(await resetLinkWorks(token, now)).toBe(true);

    await expect(resetPassword(token, "short", now)).rejects.toThrow("Use at least 8 characters");
    await resetPassword(token, "brand-new-pass", now);
    await expect(authenticate("forgot@b.lk", "password123")).rejects.toThrow(AuthError);
    expect((await authenticate("forgot@b.lk", "brand-new-pass")).id).toBe(user.id);
    expect(await userForToken(session.token)).toBeNull();

    // The link works once.
    expect(await resetLinkWorks(token, now)).toBe(false);
    await expect(resetPassword(token, "another-pass-1", now)).rejects.toThrow(/expired/);
  });

  it("says nothing about unknown emails, sends at most one email a minute, and links expire after an hour", async () => {
    const now = new Date("2026-10-11T10:00:00Z");
    const later = (s: number) => new Date(now.getTime() + s * 1000);
    expect(await requestPasswordReset("nobody@b.lk", now)).toBeNull();
    expect(mail.sent).toHaveLength(0);

    await makeUser("MERCHANT", { email: "shop@b.lk" });
    const first = await requestPasswordReset("shop@b.lk", now);
    expect(await requestPasswordReset("shop@b.lk", later(30))).toBeNull();
    const second = await requestPasswordReset("shop@b.lk", later(61));
    expect(mail.sent).toHaveLength(2);

    // Both links work until one is used; using one closes the other.
    expect(await resetLinkWorks(tokenOf(first!.link), later(120))).toBe(true);
    expect(await resetLinkWorks(tokenOf(second!.link), later(3601 + 61))).toBe(false);
    await resetPassword(tokenOf(second!.link), "brand-new-pass", later(120));
    expect(await resetLinkWorks(tokenOf(first!.link), later(121))).toBe(false);
    await expect(resetPassword("", "brand-new-pass")).rejects.toThrow(/expired/);
  });
});
