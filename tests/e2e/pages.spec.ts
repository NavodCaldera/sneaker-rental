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
