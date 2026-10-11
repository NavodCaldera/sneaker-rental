import { expect, test } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers";

test("a borrower tops up tokens and sees them in the wallet", async ({ page }) => {
  await signIn(page, ACCOUNTS.borrower);
  await page.goto("/wallet");
  await expect(page.getByRole("heading", { name: "Wallet" })).toBeVisible();
  await page.getByLabel("Tokens to buy (1 token = LKR 1)").fill("500");
  await page.getByRole("button", { name: "Pay by card" }).click();
  await expect(page.getByText("Tokens added.")).toBeVisible();
  await expect(page.getByText("Token top-up").first()).toBeVisible();
});
