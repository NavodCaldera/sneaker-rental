import { expect, test } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers";

test("5.2 borrower builds a 4-pair bundle and checks out", async ({ page }) => {
  await signIn(page, ACCOUNTS.borrower2);
  await page.goto("/browse?for=women");
  const hrefs = await page
    .locator('main ul a[href^="/shoes/"]')
    .evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  expect(hrefs.length).toBeGreaterThanOrEqual(4);

  for (const href of hrefs.slice(0, 4)) {
    await page.goto(href);
    await page.getByRole("button", { name: "Add to bundle" }).click();
    await expect(page).toHaveURL("/bundle");
  }

  await expect(page.getByText("Daily cost (4 pairs held)")).toBeVisible();
  // Booking pays the term's rent and locks the four pairs' value as a deposit.
  await expect(page.getByText(/Rent estimate for 14 days, locked now/)).toBeVisible();
  await expect(page.getByText("Deposit: pair values, locked while you rent")).toBeVisible();

  // A fifth pair breaks the 4-pair cap.
  await page.goto("/browse?for=men&experience=Morning+Run");
  await page.locator('main ul a[href^="/shoes/"]').first().click();
  await page.getByRole("button", { name: "Add to bundle" }).click();
  await expect(page.getByText(/hold up to 4 pairs/i).first()).toBeVisible();
  await page
    .getByRole("button", { name: /Remove/ })
    .last()
    .click();
  await expect(page.getByText("Daily cost (4 pairs held)")).toBeVisible();

  // Ravi's account address (seed).
  await expect(page.getByText("21/3 Hill Street, Dehiwala")).toBeVisible();
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(page).toHaveURL(/\/rentals\?booked=1/);
  await expect(page.getByText("On its way")).toHaveCount(4);
});
