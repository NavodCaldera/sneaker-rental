import { expect, test } from "@playwright/test";
import { ACCOUNTS, PASSWORD } from "./helpers";

test("closet: one size, choose a pair per slot, sign in keeps the plan, adds to the bundle", async ({
  page,
}) => {
  // A pair already in the bundle (a women's pair) must survive adding the rotation.
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ACCOUNTS.borrower3);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/sign-in/);
  await page.goto("/browse?for=women");
  await page.locator('main a[href^="/shoes/"]').first().click();
  await expect(page).toHaveURL(/\/shoes\/\w+$/);
  const kept = (await page.getByRole("heading", { level: 1 }).first().textContent())!.trim();
  await page.getByRole("button", { name: "Add to bundle" }).click();
  await expect(page).toHaveURL("/bundle");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  // Signed out: nothing is shown until who it's for and a size are picked.
  await page.goto("/closet");
  await expect(page.getByRole("heading", { level: 1, name: "Equip Your Evolution" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Rotation summary" })).toHaveCount(0);
  await page.getByLabel("Who it's for").selectOption("men");
  await page.getByLabel("Size").selectOption("UK 9");
  await page.getByRole("button", { name: "Calibrate My Rotation" }).click();
  await expect(page).toHaveURL(/\/closet\?for=men&size=UK\+9/);

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

  // Signing in comes back to the closet with the same plan.
  await summary.getByRole("link", { name: "Sign in to rent these pairs" }).click();
  await expect(page).toHaveURL("/sign-in?next=/closet");
  await page.getByLabel("Email").fill(ACCOUNTS.borrower3);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/closet");
  await expect(page.getByRole("button", { name: `Remove ${picked} from Night Out` })).toBeVisible();

  // Adding the rotation keeps what was already in the bundle.
  await page.getByRole("button", { name: /to my bundle$/ }).click();
  await expect(page).toHaveURL("/bundle");
  await expect(page.getByRole("button", { name: `Remove ${kept}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Remove ${picked}` })).toBeVisible();
});
