import { expect, test } from "@playwright/test";
import { ACCOUNTS, signIn, signOut } from "./helpers";

// 1×1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("5.1 merchant lists a shoe, previews its curve and publishes it", async ({ page }) => {
  await signIn(page, ACCOUNTS.merchant);
  await page.getByRole("link", { name: "Add shoe" }).first().click();
  await expect(page).toHaveURL("/merchant/shoes/new");

  await page.getByLabel("Brand").fill("Saucony");
  await page.getByLabel("Model").fill("Endorphin Speed 4");
  await page.getByLabel("Size").fill("UK 11");
  await page.getByLabel("Category").selectOption("Running");
  await page.getByLabel("Pickup address").fill("Colombo Kicks, 12 Galle Road, Colombo 03");
  for (const view of ["Front", "Side", "Sole", "Inside", "Box"]) {
    await page.getByLabel(`${view} photo`, { exact: true }).setInputFiles({
      name: `${view}.png`,
      mimeType: "image/png",
      buffer: PNG,
    });
  }

  // Live preview: the brief's 6,000 LKR / 365-day example.
  await page.getByLabel("Declared value (LKR)").fill("6000");
  await page.getByLabel("Expected lifespan (wear-days)").fill("365");
  await expect(page.getByText("LKR 28.92 / wear-day")).toBeVisible();
  await expect(page.getByText("LKR 8.68 / wear-day")).toBeVisible();
  await expect(page.getByText("LKR 6,600.00")).toBeVisible(); // merchant's lifetime share

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/merchant\/shoes\/\w+/);
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await signOut(page);

  // The borrower finds it.
  await signIn(page, ACCOUNTS.borrower);
  await page.getByLabel("Size").selectOption("UK 11");
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("link", { name: /Saucony Endorphin Speed 4/ }).click();
  await expect(page.getByRole("heading", { name: "Saucony Endorphin Speed 4" })).toBeVisible();
  await expect(page.locator("aside").getByText("LKR 28.92", { exact: true })).toBeVisible();
});

test("a merchant lists an upgraded second-hand pair; borrowers see its condition", async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.merchant);
  await page.goto("/merchant/shoes/new");
  await page.getByLabel("Brand").fill("Adidas");
  await page.getByLabel("Model").fill("Ultraboost Restored");
  await page.getByLabel("Size").fill("UK 8");
  await page.getByLabel("Category").selectOption("Running");
  await page.getByLabel("Pickup address").fill("Colombo Kicks, 12 Galle Road, Colombo 03");
  for (const view of ["Front", "Side", "Sole", "Inside", "Box"]) {
    await page.getByLabel(`${view} photo`, { exact: true }).setInputFiles({
      name: `${view}.png`,
      mimeType: "image/png",
      buffer: PNG,
    });
  }
  await page.getByLabel("Declared value (LKR)").fill("5000");
  // Wear used and upgrades are asked for only once the pair is second-hand / upgraded.
  await expect(page.getByLabel("Wear already used (wear-days)")).toHaveCount(0);
  await page.getByLabel("Condition").selectOption("SECOND_HAND_UPGRADED");
  await page.getByLabel("Wear already used (wear-days)").fill("100");
  await page.getByLabel("What was upgraded").fill("New insoles and laces");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/merchant\/shoes\/\w+/);
  await expect(page.getByText("Second-hand, upgraded: New insoles and laces")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await signOut(page);

  await page.goto("/browse");
  await page.getByLabel("Search").fill("Ultraboost Restored");
  await page.getByRole("button", { name: "Filter" }).click();
  const card = page.getByRole("link", { name: /Adidas Ultraboost Restored/ });
  await expect(card.getByText("Upgraded", { exact: true })).toBeVisible();
  await card.click();
  await expect(page.getByText(/Second-hand, upgraded/)).toBeVisible();
  await expect(page.getByText("New insoles and laces")).toBeVisible();
});

test("an unverified merchant can't publish until an admin verifies them", async ({ page }) => {
  const email = `newshop-${Date.now()}@test.local`;
  await page.goto("/sign-up?role=MERCHANT");
  await page.getByLabel("Full name").fill("New Shop Owner");
  await page.getByLabel("Business name").fill("Brand New Shop");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/awaiting verification/)).toBeVisible();
  await signOut(page);

  await signIn(page, ACCOUNTS.admin);
  await page.goto("/admin/merchants");
  const card = page
    .locator("div", { hasText: "Brand New Shop" })
    .filter({ has: page.getByRole("button", { name: /^(Verify|Revoke)$/ }) })
    .last();
  await expect(card.getByText("Pending")).toBeVisible();
  await card.getByRole("button", { name: "Verify" }).click();
  await expect(card.getByText("Verified")).toBeVisible();
});

test("signed-out visitors can browse and view a listing", async ({ page }) => {
  await page.goto("/browse");
  await page.getByLabel("Search").fill("Pegasus");
  await page.getByRole("button", { name: "Filter" }).click();
  await page
    .getByRole("link", { name: /Nike Pegasus 41/ })
    .first()
    .click();
  await expect(page.getByText("/ wear-day today")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).last()).toBeVisible();
});
