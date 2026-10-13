import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Nova/);
});

test("home: occasion discovery leads to browse with who-it's-for filtering", async ({
  page,
}) => {
  await page.goto("/");
  // Just listed, Best value today, Brand new pairs and Being worn now are gone from home.
  await expect(page.getByRole("region", { name: "Just listed" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Best value today" })).toHaveCount(0);

  // Demographic tabs are no longer on home.
  await expect(page.getByRole("navigation", { name: "Who it's for" })).toHaveCount(0);

  // Occasions and curated style packs lead prominently.
  await expect(page.getByRole("region", { name: "Moments and occasions" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Curated rotations" })).toBeVisible();

  // Clicking an occasion card navigates to the dedicated browse page with that experience.
  await page.getByRole("link", { name: /Morning Run & Performance/ }).click();
  await expect(page).toHaveURL(/\/browse\?experience=Morning(\+|%20)Run/);

  // On the browse page, Who it's for tabs are ready for filtering.
  const tabs = page.getByRole("navigation", { name: "Who it's for" });
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

test("home: occasion concierge search bar opens personal stylist chat", async ({
  page,
}) => {
  await page.goto("/");

  // Verify the occasion search bar is present with Tell Nova your plans copy
  const searchInput = page.getByPlaceholder("Tell Nova your plans...");
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

test("header: Build Your Nova Closet link and unified Sign in / Sign up button", async ({
  page,
}) => {
  await page.goto("/");

  // Header has "Build Your Nova Closet" link
  const closetLink = page.getByRole("link", { name: "Build Your Nova Closet" });
  await expect(closetLink).toBeVisible();

  // Header has unified "Sign in / Sign up" button
  const authBtn = page.getByRole("link", { name: "Sign in / Sign up" });
  await expect(authBtn).toBeVisible();

  // Dark/light mode button is placed after the sign in / sign up button
  await expect(page.getByRole("button", { name: /mode/i })).toBeVisible();

  // Clicking "Build Your Nova Closet" navigates to /closet
  await closetLink.click();
  await expect(page).toHaveURL("/closet");

  // On /closet, the Virtual Rotating Wardrobe simulator is visible
  const closet = page.getByRole("region", { name: "Your Nova Closet" });
  await expect(closet).toBeVisible();
  await expect(closet.getByText("The Wear-Sharing Engine")).toBeVisible();
  await expect(closet.getByText("Active Rotation")).toBeVisible();
  await expect(closet.getByText("Daily Wear Division")).toBeVisible();
  await expect(closet.getByText("Unlocked Retail Value")).toBeVisible();
  await expect(closet.getByText("Combined Daily Rent")).toBeVisible();

  // Test adding an extra slot (unlimited capacity)
  await closet.getByRole("button", { name: "+ Add Extra Pair Slot" }).click();
  await expect(closet.getByText("Empty Slot 5")).toBeVisible();

  // Verify the Equip button is present
  const equipBtn = closet.getByRole("button", { name: /Equip This Rotation/ });
  await expect(equipBtn).toBeVisible();
});
