import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Nova/);
});

test("home: who-it's-for tabs, experience chips, rows, and search leads to Browse", async ({
  page,
}) => {
  await page.goto("/");
  // Just listed, Best value today, Brand new pairs and Being worn now are gone from home.
  await expect(page.getByRole("region", { name: "Just listed" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Best value today" })).toHaveCount(0);
  // Before picking a tab there are no experience chips.
  await expect(page.getByRole("navigation", { name: /Experiences for/ })).toHaveCount(0);

  // Kids' tabs show their own experiences.
  const tabs = page.getByRole("navigation", { name: "Who it's for" });
  await tabs.getByRole("link", { name: "Girls" }).click();
  await expect(page).toHaveURL("/?for=girls");
  const girls = page.getByRole("navigation", { name: "Experiences for Girls" });
  await expect(girls.getByRole("link", { name: /Party Time/ })).toBeVisible();
  await expect(girls.getByRole("link", { name: /Work Day/ })).toHaveCount(0);

  // Men, then an experience, narrows every row to both.
  await tabs.getByRole("link", { name: "Men", exact: true }).click();
  await expect(page).toHaveURL("/?for=men");
  await page
    .getByRole("navigation", { name: "Experiences for Men" })
    .getByRole("link", { name: /Morning Run/ })
    .click();
  await expect(page).toHaveURL("/?for=men&experience=Morning+Run");
  // Nothing in Men · Morning Run is discounted, so Exceptional Value shows the whole shop's.
  const deals = page.getByRole("region", { name: "Exceptional Value" });
  await expect(deals.getByText(/\d+(\.\d)?% off/).first()).toBeVisible();

  // Typing in "Brand or model" drops down matching brands and models; picking one searches.
  const box = page.getByRole("search", { name: "Find shoes" }).getByLabel("Brand or model");
  await box.fill("pegas");
  const list = page.getByRole("listbox", { name: "Suggestions" });
  await expect(list.getByRole("option", { name: /Nike Pegasus 41/ })).toBeVisible();
  await box.fill("zzzz");
  await expect(list).toHaveCount(0);
  await box.fill("");

  // Searching opens Browse with the filters.
  const search = page.getByRole("search", { name: "Find shoes" });
  await search.getByLabel("Brand or model").fill("Pegasus");
  await search.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/browse\?for=men&experience=Morning\+Run&size=&q=Pegasus/);
  await expect(page.getByRole("link", { name: /Nike Pegasus 41/ }).first()).toBeVisible();
});

test("day and night mode: the header switch flips the colours and is remembered", async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: "light" });
  const page = await context.newPage();
  await page.goto("/");
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await background()).toBe("rgb(255, 255, 255)");
  await page.getByRole("button", { name: "Switch to night mode" }).click();
  expect(await background()).toBe("rgb(0, 0, 0)");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to day mode" }).click();
  expect(await background()).toBe("rgb(255, 255, 255)");
  await context.close();
});
