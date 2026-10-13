import { expect, test } from "@playwright/test";
import { ACCOUNTS, PASSWORD } from "./helpers";

test("closet: signed out goes to sign-in and comes back to the closet", async ({ page }) => {
  await page.goto("/closet");
  await expect(page).toHaveURL("/sign-in?next=/closet");
  await page.getByLabel("Email").fill(ACCOUNTS.borrower2);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/closet");
  await expect(page.getByRole("heading", { level: 1, name: "Equip Your Evolution" })).toBeVisible();
});

test("closet: profile size, choose a pair per slot, adds to the bundle", async ({ page }) => {
  // A pair already in the bundle (a women's pair) must survive adding the rotation.
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ACCOUNTS.borrower2);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/sign-in/);
  await page.goto("/browse?for=women");
  await page.locator('main a[href^="/shoes/"]').first().click();
  await expect(page).toHaveURL(/\/shoes\/\w+$/);
  const kept = (await page.getByRole("heading", { level: 1 }).first().textContent())!.trim();
  await page.getByRole("button", { name: "Add to bundle" }).click();
  await expect(page).toHaveURL("/bundle");

  // The closet is in the customer's own size and for them: no form to fill in.
  await page.goto("/closet");
  await expect(page.getByRole("heading", { level: 1, name: "Equip Your Evolution" })).toBeVisible();
  await expect(page.getByText("Showing pairs in your size:")).toContainText("UK 9 · Men");
  await expect(page.getByLabel("Who it's for")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Change your size in your profile" })).toBeVisible();

  // Only pairs in that size are offered.
  const shelf = page.getByRole("region", { name: /Pairs in your size/ });
  const cards = shelf.getByRole("listitem");
  const sizes = await cards.locator("span.text-xs", { hasText: /^(UK|EU|US) / }).allTextContents();
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.length).toBe(await cards.count());
  for (const s of sizes) expect(s).toContain("UK 9");

  // Choose a pair for Night Out: the shelf says so, and the pair lands in that slot.
  await page.getByRole("button", { name: "Choose a pair for Night Out" }).click();
  const chooser = page.getByRole("region", { name: "Choose a pair for Night Out" });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "All", exact: true }).click();
  const add = chooser.getByRole("button", { name: /to Night Out$/ }).first();
  const picked = (await add.getAttribute("aria-label"))!.replace(/^Add (.*) to Night Out$/, "$1");
  await add.click();
  await expect(page.getByRole("button", { name: `Remove ${picked} from Night Out` })).toBeVisible();
  const summary = page.getByRole("region", { name: "Rotation summary" });
  await expect(summary).toContainText(/per day/);

  // Adding the rotation keeps what was already in the bundle.
  await page.getByRole("button", { name: /to my bundle$/ }).click();
  await expect(page).toHaveURL("/bundle");
  await expect(page.getByRole("button", { name: `Remove ${kept}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Remove ${picked}` })).toBeVisible();
});
