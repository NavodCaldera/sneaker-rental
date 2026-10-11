import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Sneaker Rental/);
});

test("home: style tabs, rows of pairs, and the search bar leads to Browse", async ({ page }) => {
  await page.goto("/");
  const justListed = page.getByRole("region", { name: "Just listed" });
  await expect(justListed.getByRole("link", { name: /Nike Pegasus 41/ }).first()).toBeVisible();
  await expect(justListed.getByText("/ wear-day").first()).toBeVisible();

  // A style tab narrows every row to that style.
  await page
    .getByRole("navigation", { name: "Styles" })
    .getByRole("link", { name: "Running" })
    .click();
  await expect(page).toHaveURL("/?category=Running");
  await expect(page.getByRole("region", { name: "Just listed in Running" })).toBeVisible();

  // Searching opens Browse with the filters.
  const search = page.getByRole("search", { name: "Find sneakers" });
  await search.getByLabel("Brand or model").fill("Pegasus");
  await search.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/browse\?category=Running&size=&q=Pegasus/);
  await expect(page.getByRole("link", { name: /Nike Pegasus 41/ }).first()).toBeVisible();
});
