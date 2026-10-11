import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  AuthError,
  authenticate,
  registerUser,
  signUpSchema,
  startSession,
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
    });
    const user = await registerUser(input);
    expect(user.email).toBe("kasun@shop.lk");
    expect(user.passwordHash).not.toContain("longenough");
    expect(await db.merchant.count({ where: { userId: user.id } })).toBe(1);

    const signedIn = await authenticate("KASUN@shop.lk", "longenough");
    expect(signedIn.id).toBe(user.id);
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
      },
      admin.id,
    );
    const after = await getActiveSettings();
    expect(after.merchantMargin.toString()).toBe("0.12");
    expect(toPricingSettings(after)).toMatchObject({ minLife: 90, maxLife: 730, refLife: 365 });
    expect(await db.pricingSettings.count()).toBe(2); // append-only
  });
});
