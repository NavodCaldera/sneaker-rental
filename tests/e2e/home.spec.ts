import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Nova/);
});

test("home: occasion discovery leads to sign-in, then Browse", async ({ page }) => {
  await page.goto("/");
  // Just listed, Best value today, Brand new pairs and Being worn now are gone from home.
  await expect(page.getByRole("region", { name: "Just listed" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Best value today" })).toHaveCount(0);

  // Demographic tabs are no longer on home.
  await expect(page.getByRole("navigation", { name: "Who it's for" })).toHaveCount(0);

  // Occasions and curated style packs lead prominently.
  await expect(
    page.getByRole("region", { name: "Arenas of character and presence" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Curated transformation blueprints" }),
  ).toBeVisible();

  // Browse needs an account: signed out, an occasion card leads to sign-in and back to Browse.
  await page.getByRole("link", { name: /Endurance & Relentless Grit/ }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fbrowse%3Fexperience%3DMorning(\+|%20)Run/);
});
  await expect(tabs).toBeVisible();

  // Clicking Men narrows to Men for that occasion.
  await tabs.getByRole("link", { name: "Men", exact: true }).click();
  await expect(page).toHaveURL(/for=men/);
  await expect(page).toHaveURL(/experience=Morning(\+|%20)Run/);

  // Clicking All clears the demographic restriction.
  await tabs.getByRole("link", { name: "All", exact: true }).click();
  await expect(page).not.toHaveURL(/for=men/);
  await expect(page).toHaveURL(/experience=Morning(\+|%20)Run/);
});

test("home: occasion concierge search bar opens personal stylist chat", async ({ page }) => {
  await page.goto("/");

  // Verify the occasion search bar is present with Tell Nova the presence you want to command copy
  const searchInput = page.getByPlaceholder("Tell Nova the presence you want to command...");
  await expect(searchInput).toBeVisible();

  // Enter an occasion and submit
  await searchInput.fill("Morning 5K run by Galle Face");
  await page.getByRole("button", { name: "Ask Nova Stylist" }).click();

  // Bottom-right chat dialog opens
  const chatDialog = page.getByRole("dialog", { name: "Nova Stylist Concierge" });
  await expect(chatDialog).toBeVisible();
  await expect(chatDialog.getByText("Nova Personal Stylist")).toBeVisible();

  // Stylist provides advice and recommendations
  await expect(chatDialog.getByText(/responsive cushioning|Recommended Pairs/i)).toBeVisible();

  // Close the chat
  await page.getByRole("button", { name: "Close stylist chat" }).click();
  await expect(chatDialog).toHaveCount(0);

  // Floating re-open button is available
  await expect(page.getByRole("button", { name: /Nova Stylist/ })).toBeVisible();
});

test("header: Equip Your Evolution link and unified Sign in / Sign up button", async ({ page }) => {
  await page.goto("/");

  // Header has "Equip Your Evolution" link
  const closetLink = page.getByRole("link", { name: "Equip Your Evolution" });
  await expect(closetLink).toBeVisible();

  // Header has unified "Sign in / Sign up" button
  const authBtn = page.getByRole("link", { name: "Sign in / Sign up" });
  await expect(authBtn).toBeVisible();

  // Dark/light mode button is placed after the sign in / sign up button
  await expect(page.getByRole("button", { name: /mode/i })).toBeVisible();

  // The Closet needs an account: signed out, the link leads to sign-in and back after it.
  await closetLink.click();
  await expect(page).toHaveURL("/sign-in?next=/closet");
});

test.describe("welcome animation", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("first-time visitors see the questions, then the home page", async ({ page }) => {
    await page.goto("/");
    const intro = page.getByRole("dialog", { name: "Welcome to Nova" });
    await expect(intro).toBeVisible();
    await expect(intro.getByText("Whom do you want to become?")).toHaveCount(1);
    await intro.getByRole("button", { name: "Skip" }).click();
    await expect(intro).toHaveCount(0);

    // Not shown again on this visit.
    await page.goto("/");
    await expect(page.getByRole("dialog", { name: "Welcome to Nova" })).toHaveCount(0);
  });
});
