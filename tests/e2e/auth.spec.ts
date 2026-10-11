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
  await page.getByLabel("Password", { exact: true }).fill("nope-nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect")).toBeVisible();
});

test("the eye button shows and hides the password", async ({ page }) => {
  await page.goto("/sign-in");
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("secret-123");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("secret-123");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
});

test("a new merchant can sign up", async ({ page }) => {
  await page.goto("/sign-up?role=MERCHANT");
  await page.getByLabel("Full name").fill("Test Merchant");
  await page.getByLabel("Business name").fill("Test Shoes");
  await page.getByLabel("Email").fill(`merchant-${Date.now()}@test.local`);
  // The address field and its reason follow the account type.
  await expect(page.getByText(/Drivers pick up your shoes from this address/)).toBeVisible();
  await page.getByLabel("Pickup and return address").fill("Test Shoes, 5 Station Road");
  await page.getByLabel("City").fill("Colombo 06");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/merchant");
  await page.goto("/merchant/account");
  await expect(page.getByLabel("Pickup and return address")).toHaveValue(
    "Test Shoes, 5 Station Road",
  );
  await expect(page.getByLabel("City")).toHaveValue("Colombo 06");
});

test("a new customer signs up with their date of birth; merchants aren't asked", async ({
  page,
}) => {
  await page.goto("/sign-up");
  await page.getByText("Merchant", { exact: true }).click();
  await expect(page.getByLabel("Date of birth")).toHaveCount(0);
  await page.getByText("Customer", { exact: true }).click();
  await page.getByLabel("Full name").fill("Test Customer");
  await page.getByLabel("Email").fill(`customer-${Date.now()}@test.local`);
  await page.getByLabel("Date of birth").fill("2000-06-15");
  await page.getByLabel("Delivery and collection address").fill("5 Lake Road");
  await page.getByLabel("City").fill("Kandy");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/browse");
  await page.goto("/account");
  await expect(page.getByText(/15 Jun 2000 \(age \d+\)/)).toBeVisible();
});
