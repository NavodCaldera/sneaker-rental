import { expect, test } from "@playwright/test";
import { ACCOUNTS, signIn, signOut } from "./helpers";

test("a merchant makes a style pack, an admin approves it, a borrower rents the rotation", async ({
  page,
}) => {
  const title = `Test Rotation ${Date.now()}`;

  // The merchant curates pairs from any shop and sends the pack for review.
  await signIn(page, ACCOUNTS.merchant);
  await page.getByRole("link", { name: "Style packs" }).click();
  await page.getByRole("link", { name: "New pack" }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Rotation advantage (optional)").fill("Hold 2 pairs · wear splits 2 ways");
  await page.getByLabel("Role 1 name").fill("Daily Runner");
  await page.getByLabel("Find a pair for role 1").fill("Pegasus");
  await page
    .getByRole("button", { name: /^Add Nike Pegasus 41 .* to role 1$/ })
    .first()
    .click();
  await page.getByLabel("Role 2 name").fill("Weekend Classic");
  await page.getByLabel("Role 2 experience (optional)").selectOption("Weekend Stroll");
  await page.getByLabel("Find a pair for role 2").fill("Puma");
  await page.getByRole("button", { name: /^Add Puma Suede Classic .* to role 2$/ }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/merchant\/packs\/\w+$/);
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("Waiting for review", { exact: true })).toBeVisible();
  await signOut(page);

  // Not on the site until an admin approves it.
  await page.goto("/");
  await expect(page.getByRole("article", { name: title })).toHaveCount(0);

  await signIn(page, ACCOUNTS.admin);
  await page.goto("/admin/packs");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await signOut(page);

  // Borrowers find it on the home page and put the rotation in their bundle.
  await signIn(page, ACCOUNTS.borrower);
  await page.goto("/");
  const card = page.getByRole("article", { name: title });
  await expect(card.getByText("Daily Runner")).toBeVisible();
  await card.getByRole("link", { name: /Explore This Rotation/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(/per day: each day's wear is split/)).toBeVisible();
  // The rotation takes the first bookable pair of each role (earlier tests may have rented
  // some pairs, so read which ones the page offers).
  const picks: string[] = [];
  for (const role of await page.locator("main ol > li").all()) {
    const add = role.getByRole("button", { name: /^Add .* to bundle$/ }).first();
    if ((await add.count()) > 0) {
      picks.push((await add.getAttribute("aria-label"))!.replace(/^Add (.*) to bundle$/, "$1"));
    }
  }
  expect(picks.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Add the rotation to my bundle" }).click();
  await expect(page).toHaveURL(/\/bundle/);
  for (const name of picks) {
    await expect(page.getByRole("button", { name: `Remove ${name}` }).first()).toBeVisible();
  }
});

test("an admin sends a merchant's pack back with a reason", async ({ page }) => {
  const title = `Needs Work ${Date.now()}`;
  await signIn(page, ACCOUNTS.merchant2);
  await page.goto("/merchant/packs/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Role 1 name").fill("Only Role");
  await page.getByLabel("Find a pair for role 1").fill("Samba");
  await page.getByRole("button", { name: /^Add Adidas Samba OG .* to role 1$/ }).click();
  await page.getByRole("button", { name: "Remove role 2" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("Waiting for review", { exact: true })).toBeVisible();
  await signOut(page);

  await signIn(page, ACCOUNTS.admin);
  await page.goto("/admin/packs");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Say what the merchant should change")).toBeVisible();
  await page.getByLabel("Ask for changes").fill("Add a second pair for rainy days.");
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Needs changes", { exact: true })).toBeVisible();
  await signOut(page);

  await signIn(page, ACCOUNTS.merchant2);
  await page.goto("/merchant/packs");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByText("Admin note: Add a second pair for rainy days.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send for review" })).toBeVisible();
});
