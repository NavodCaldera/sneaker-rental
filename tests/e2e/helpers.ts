import { expect, type Page } from "@playwright/test";

export const PASSWORD = "password123";

export const ACCOUNTS = {
  admin: "admin@sneakers.test",
  merchant: "kicks@sneakers.test",
  merchant2: "sole@sneakers.test",
  borrower: "amaya@sneakers.test",
  borrower2: "ravi@sneakers.test",
  borrower3: "nimal@sneakers.test",
} as const;

export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/sign-in/);
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
}
