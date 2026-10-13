import { expect, test } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers";

/** Every page in each role's navigation renders without an error. */
for (const [role, email] of [
  ["borrower", ACCOUNTS.borrower],
  ["merchant", ACCOUNTS.merchant],
  ["admin", ACCOUNTS.admin],
] as const) {
  test(`${role}: every nav page renders`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await signIn(page, email);
    const hrefs = await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link")
      .evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
    expect(hrefs.length).toBeGreaterThan(2);
    for (const href of hrefs) {
      const res = await page.goto(href);
      expect(res?.status(), href).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 }).first(), href).toBeVisible();
      await expect(page.getByText(/Runtime Error|Unhandled/), href).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

test("Back returns to the browse page, or to browse when the listing was opened directly", async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.borrower);
  await page.goto("/browse?brand=Adidas");
  await page.locator('main a[href^="/shoes/"]').first().click();
  await expect(page).toHaveURL(/\/shoes\/\w+$/);
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL("/browse?brand=Adidas");

  const href = await page.locator('main a[href^="/shoes/"]').first().getAttribute("href");
  await page.goto(href!);
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL("/browse");
});

test("Back on a merchant sub-page goes to its list", async ({ page }) => {
  await signIn(page, ACCOUNTS.merchant);
  await page.goto("/merchant/packs/new");
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL("/merchant/packs");
  await page.goto("/merchant/shoes/new");
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL("/merchant");
});
