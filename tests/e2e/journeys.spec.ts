import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, signOut } from "./helpers";

const PNG = {
  name: "photo.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
};

function tripCard(page: Page, shoe: string, type: string) {
  return page.getByRole("listitem").filter({ hasText: shoe }).filter({ hasText: type });
}

test("delivery → condition → return → close → restock, across all four roles", async ({
  page,
  browser,
}) => {
  const shoe = "Vans Old Skool";

  // 5.2 Borrower books one pair.
  await signIn(page, ACCOUNTS.borrower3);
  await page.goto("/browse?category=Skate");
  await page.getByRole("link", { name: new RegExp(shoe) }).click();
  await page.getByRole("button", { name: "Add to bundle" }).click();
  await page.getByLabel("Delivery address").fill("9 Lake Drive, Colombo 08");
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(page.getByText("On its way")).toBeVisible();
  await signOut(page);

  // Admin quotes and books the trip, and gets the courier link.
  await signIn(page, ACCOUNTS.admin);
  await page.goto("/admin/deliveries");
  const deliver = tripCard(page, shoe, "Merchant → borrower");
  await deliver.getByLabel("Trip fee (LKR)").fill("400");
  await deliver.getByRole("button", { name: "Save quote" }).click();
  await expect(deliver.getByText("quoted")).toBeVisible();
  await deliver.getByRole("button", { name: "Mark booked" }).click();
  const link = await deliver.getByRole("link", { name: /\/courier\// }).getAttribute("href");
  expect(link).toBeTruthy();
  await signOut(page);

  // The driver, on a phone with no account, uses the courier link.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const driver = await phone.newPage();
  await driver.goto(link!);
  await expect(driver.getByRole("heading", { name: "Delivery trip" })).toBeVisible();
  await driver.getByLabel("Photo of the sealed bag").setInputFiles(PNG);
  await driver.getByLabel("The pair is in a sealed bag").check();
  await driver.getByRole("button", { name: "Picked up" }).click();
  await expect(driver.getByRole("heading", { name: "At drop-off" })).toBeVisible();
  await driver.getByLabel("Photo of the sealed bag at the door").setInputFiles(PNG);
  await driver.getByRole("button", { name: "Delivered" }).click();
  await expect(driver.getByText("Delivered. Thank you!")).toBeVisible();
  await phone.close();

  // The borrower confirms condition, then ends the rental.
  await signIn(page, ACCOUNTS.borrower3);
  await page.goto("/rentals");
  await expect(page.getByText("With you")).toBeVisible();
  await page.getByRole("link", { name: "Confirm condition" }).click();
  await page.getByLabel("A · As new").check();
  await page.getByLabel("Photos", { exact: true }).setInputFiles(PNG);
  await page.getByRole("button", { name: "Confirm condition" }).click();
  await expect(page).toHaveURL("/rentals");
  await page.getByRole("button", { name: new RegExp(`End rental of ${shoe}`) }).click();
  await expect(page.getByText("Returning")).toBeVisible();
  await signOut(page);

  // Return trip, moved along by the admin (manual fallback).
  await signIn(page, ACCOUNTS.admin);
  await page.goto("/admin/deliveries");
  const collect = tripCard(page, shoe, "Borrower → merchant");
  await collect.getByRole("button", { name: "Mark booked" }).click();
  await collect.getByRole("button", { name: "Picked up" }).click();
  await collect.getByRole("button", { name: "Delivered" }).click();
  await expect(tripCard(page, shoe, "Borrower → merchant")).toHaveCount(0);
  await signOut(page);

  // 5.4 The merchant records condition (closes the rental) and restocks the pair.
  await signIn(page, ACCOUNTS.merchant2);
  await page.goto("/merchant/returns");
  await page.getByRole("link", { name: "Record condition" }).click();
  await page.getByLabel("B · Light wear").check();
  await page.getByLabel("Photos", { exact: true }).setInputFiles(PNG);
  await page.getByRole("button", { name: "Record condition" }).click();
  await expect(page).toHaveURL("/merchant/returns");
  await page.getByRole("button", { name: "Cleaned, back in stock" }).click();
  await expect(page.getByText("Nothing being cleaned")).toBeVisible();
  await signOut(page);

  // The borrower sees the closed rental and the released deposit.
  await signIn(page, ACCOUNTS.borrower3);
  await page.goto("/rentals");
  await expect(page.getByText("Closed", { exact: true })).toBeVisible();
  await expect(page.getByText("released")).toBeVisible();
});
