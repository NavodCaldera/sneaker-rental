import { expect, test } from "@playwright/test";
import { ACCOUNTS, signIn, signOut } from "./helpers";

test("each role lands on its own home and can't open other roles' pages", async ({ page }) => {
  await signIn(page, ACCOUNTS.merchant);
  await expect(page).toHaveURL("/merchant");
  await page.goto("/admin");
  await expect(page).toHaveURL("/merchant");
  await signOut(page);

  await signIn(page, ACCOUNTS.admin);
  await expect(page).toHaveURL("/admin");
  await signOut(page);

  await signIn(page, ACCOUNTS.borrower);
  await expect(page).toHaveURL("/browse");
  await page.goto("/merchant");
  await expect(page).toHaveURL("/browse");
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/merchant");
  await expect(page).toHaveURL("/sign-in");
});

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ACCOUNTS.borrower);
  await page.getByLabel("Password").fill("nope-nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect")).toBeVisible();
});

test("a new merchant can sign up", async ({ page }) => {
  await page.goto("/sign-up?role=MERCHANT");
  await page.getByLabel("Full name").fill("Test Merchant");
  await page.getByLabel("Business name").fill("Test Shoes");
  await page.getByLabel("Email").fill(`merchant-${Date.now()}@test.local`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/merchant");
});
