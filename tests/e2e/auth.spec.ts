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

test("a new customer signs up with their age; merchants aren't asked", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByText("Merchant", { exact: true }).click();
  await expect(page.getByLabel("Age", { exact: true })).toHaveCount(0);
  await page.getByText("Customer", { exact: true }).click();
  await page.getByLabel("Full name").fill("Test Customer");
  await page.getByLabel("Email").fill(`customer-${Date.now()}@test.local`);
  await page.getByLabel("Age", { exact: true }).fill("26");
  await page.getByLabel("Delivery and collection address").fill("5 Lake Road");
  await page.getByLabel("City").fill("Kandy");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/browse");
  await page.goto("/account");
  await expect(page.getByText("Age 26")).toBeVisible();
});

test("a customer who forgot their password resets it from the emailed link", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL("/forgot-password");
  await page.getByLabel("Email").fill(ACCOUNTS.borrower3);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/has an account, we've emailed it a link/)).toBeVisible();

  // Emails aren't really sent in development: the page shows the link instead.
  await page.getByRole("link", { name: "Reset your password" }).click();
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  const resetUrl = page.url();
  // Set it back to the seed password so other tests can still sign in.
  await page.getByLabel("New password").fill("password123");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL("/sign-in?reset=done");
  await expect(page.getByText("Your password has been changed")).toBeVisible();
  await signIn(page, ACCOUNTS.borrower3);
  await expect(page).toHaveURL("/browse");

  // The link works once.
  await page.goto(resetUrl);
  await expect(page.getByText("This link has expired or was already used.")).toBeVisible();
});
