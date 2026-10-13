import { expect, test } from "@playwright/test";
import { ACCOUNTS, signIn, signOut } from "./helpers";

test("each role lands on its own home and can't open other roles' pages", async ({ page }) => {
  await signIn(page, ACCOUNTS.merchant);
  await expect(page).toHaveURL("/merchant");
  await page.goto("/admin");
  await expect(page).toHaveURL("/merchant");
  await signOut(page);

  await signIn(page, ACCOUNTS.admin);
  await expect(page).toHaveURL("/admin");
  await signOut(page);

  await signIn(page, ACCOUNTS.borrower);
  await expect(page).toHaveURL("/browse");
  await page.goto("/merchant");
  await expect(page).toHaveURL("/browse");
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/merchant");
  await expect(page).toHaveURL("/sign-in");
});

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ACCOUNTS.borrower);
  await page.getByLabel("Password", { exact: true }).fill("nope-nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect")).toBeVisible();
});

test("the eye button shows and hides the password", async ({ page }) => {
  await page.goto("/sign-in");
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("secret-123");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("secret-123");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
});

test("a new merchant can sign up", async ({ page }) => {
  await page.goto("/sign-up?role=MERCHANT");
  await page.getByLabel("Full name").fill("Test Merchant");
  await page.getByLabel("Business name").fill("Test Shoes");
  await page.getByLabel("Email").fill(`merchant-${Date.now()}@test.local`);
  // The address field and its reason follow the account type.
  await expect(page.getByText(/Drivers pick up your shoes from this address/)).toBeVisible();
  await page.getByLabel("Pickup and return address").fill("Test Shoes, 5 Station Road");
  await page.getByLabel("City").fill("Colombo 06");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/merchant");
  await page.goto("/merchant/account");
  await expect(page.getByLabel("Pickup and return address")).toHaveValue(
    "Test Shoes, 5 Station Road",
  );
  await expect(page.getByLabel("City")).toHaveValue("Colombo 06");
});

test("a new customer tells us who they want to become and is shown shoes for them", async ({
  page,
}) => {
  await page.goto("/sign-up");
  await page.getByText("Merchant", { exact: true }).click();
  await expect(page.getByText("Whom do you want to become?")).toHaveCount(0);
  await expect(page.getByLabel("Date of birth")).toHaveCount(0);
  await page.getByText("Customer", { exact: true }).click();
  await page.getByLabel("Full name").fill("Test Customer");
  await page.getByLabel("Email").fill(`customer-${Date.now()}@test.local`);
  // Why we ask for the date of birth, to build trust.
  await expect(
    page.getByText(
      "We value your celebrations: in your birthday month, rent is on us for up to 4 pairs.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.getByText("For example:")).toHaveCount(0);
  await page
    .getByLabel("Whom do you want to become?")
    .fill("I want to build Sri Lanka's largest tech sensation. People see me as calm and sharp.");
  await page.getByLabel("Gender").selectOption("MALE");
  await page.getByLabel("Date of birth").fill("1993-07-02");
  await page.getByLabel("Size system").selectOption("UK");
  await page.getByLabel("Shoe size").fill("9");
  await page.getByLabel("Delivery and collection address").fill("5 Lake Road");
  await page.getByLabel("City").fill("Kandy");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/browse");

  // Browse starts in their size, for them, with pairs for who they want to become first.
  await expect(
    page.getByText("Shoes in your size, UK 9 · Men, picked for who you want to become first."),
  ).toBeVisible();
  await expect(page.getByLabel("Size", { exact: true })).toHaveValue("UK 9");
  await expect(page.getByRole("combobox", { name: "Who it's for" })).toHaveValue("men");
  await page.getByRole("link", { name: "Show all shoes" }).click();
  await expect(page).toHaveURL("/browse?all=1");
  await expect(page.getByLabel("Size", { exact: true })).toHaveValue("");

  // The Closet starts from the same size.
  await page.goto("/closet");
  await expect(page.getByLabel("Who it's for")).toHaveValue("men");
  await expect(page.getByLabel("Size", { exact: true })).toHaveValue("UK 9");

  // The account page shows the profile and changes it.
  await page.goto("/account");
  await expect(page.getByText(/^Age \d+$/)).toBeVisible();
  await expect(page.getByLabel("Whom do you want to become?")).toHaveValue(
    "I want to build Sri Lanka's largest tech sensation. People see me as calm and sharp.",
  );
  await expect(page.getByLabel("Shoe size")).toHaveValue("9");
  await page.getByLabel("Shoe size").fill("10");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await page.goto("/browse");
  await expect(page.getByText(/Shoes in your size, UK 10 · Men/)).toBeVisible();
});

test("a customer who forgot their password resets it from the emailed link", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL("/forgot-password");
  await page.getByLabel("Email").fill(ACCOUNTS.borrower3);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/has an account, we've emailed it a link/)).toBeVisible();

  // Emails aren't really sent in development: the page shows the link instead.
  await page.getByRole("link", { name: "Reset your password" }).click();
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  const resetUrl = page.url();
  // Set it back to the seed password so other tests can still sign in.
  await page.getByLabel("New password").fill("password123");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL("/sign-in?reset=done");
  await expect(page.getByText("Your password has been changed")).toBeVisible();
  await signIn(page, ACCOUNTS.borrower3);
  await expect(page).toHaveURL("/browse");

  // The link works once.
  await page.goto(resetUrl);
  await expect(page.getByText("This link has expired or was already used.")).toBeVisible();
});
