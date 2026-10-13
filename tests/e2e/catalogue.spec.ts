import { expect, test } from "@playwright/test";
import { ACCOUNTS, signIn, signOut } from "./helpers";

// 1×1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("5.1 merchant lists a shoe, previews its curve and publishes it", async ({ page }) => {
  await signIn(page, ACCOUNTS.merchant);
  await page.getByRole("link", { name: "Add shoe" }).first().click();
  await expect(page).toHaveURL("/merchant/shoes/new");

  await page.getByLabel("Brand").fill("Saucony");
  await page.getByLabel("Model").fill("Endorphin Speed 4");
  await page.getByLabel("To whom").selectOption("Men");
  await page.getByText("Morning Run", { exact: true }).click();
  // Listed in the sizes on its labels (EU), with how many pairs of each; the form shows what
  // borrowers see in the other systems.
  await page.getByLabel("Size system").selectOption("EU");
  await page.getByLabel("Size 1", { exact: true }).fill("46");
  await page.getByLabel("Pairs of size 1").fill("2");
  await expect(page.getByText("Borrowers also see UK 11 · US 11.5 · 29.5 cm")).toBeVisible();
  await page.getByRole("button", { name: "Add another size" }).click();
  await page.getByLabel("Size 2", { exact: true }).fill("45");
  await expect(page.getByText("3 pairs in 2 sizes")).toBeVisible();
  for (const view of ["Front", "Side", "Sole", "Inside", "Box"]) {
    await page.getByLabel(`${view} photo`, { exact: true }).setInputFiles({
      name: `${view}.png`,
      mimeType: "image/png",
      buffer: PNG,
    });
  }

  // Live preview: the brief's 6,000 LKR / 365-day example.
  await page.getByLabel("Price", { exact: true }).fill("6000");
  await page.getByLabel("Expected lifespan (days)").fill("365");
  await expect(page.getByText("LKR 28.92 per day")).toBeVisible();
  await expect(page.getByText("LKR 8.68 per day")).toBeVisible();
  await expect(page.getByText("LKR 6,600.00")).toBeVisible(); // merchant's lifetime share

  // Picked up from the merchant's one address, set on their account.
  await expect(page.getByText("Colombo Kicks, 12 Galle Road, Colombo 03")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/merchant\/shoes\/\w+/);
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await expect(page.getByText("3 pairs in 2 sizes. Each pair is rented")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  // Publishing makes every pair of the listing available.
  await expect(page.getByText(/Pair 2: available/)).toBeVisible();
  await signOut(page);

  // The borrower finds it by their UK size, and sees what that is in EU.
  await signIn(page, ACCOUNTS.borrower);
  // Browse starts from the customer's own profile; this search is for everyone.
  await page.getByRole("combobox", { name: "Who it's for" }).selectOption("");
  await page.getByLabel("Size", { exact: true }).selectOption("UK 11");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByRole("heading", { name: "UK 11 is the same as" })).toBeVisible();
  await page.getByRole("link", { name: "Saucony Endorphin Speed 4, EU 46 · UK 11" }).click();
  await expect(page.getByRole("heading", { name: "Saucony Endorphin Speed 4" })).toBeVisible();
  await expect(page.locator("aside").getByText("LKR 28.92", { exact: true })).toBeVisible();
  const size = page.getByRole("region", { name: "Size", exact: true });
  await expect(
    size.getByText("EU 46 is on the label (men's sizes; cm is foot length)."),
  ).toBeVisible();
  await expect(size.getByRole("definition")).toHaveText(["11", "46", "11.5", "29.5"]);
  // The listing's other size is one click away, with how many pairs are free.
  const sizes = page.getByRole("navigation", { name: "Sizes" });
  await expect(sizes.getByRole("link", { name: "UK 11: 2 free" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await sizes.getByRole("link", { name: "UK 10.5: 1 free" }).click();
  await expect(
    page.getByRole("region", { name: "Size", exact: true }).getByRole("definition"),
  ).toHaveText(["10.5", "45", "11", "29"]);
});

test("a merchant picks exponential decay, can switch it as a draft, and it's fixed once published", async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.merchant);
  await page.goto("/merchant/shoes/new");
  await page.getByLabel("Brand").fill("Hoka");
  await page.getByLabel("Model").fill("Clifton Decay");
  await page.getByLabel("Size 1", { exact: true }).fill("10");
  await page.getByLabel("To whom").selectOption("Men");
  await page.getByText("Morning Run", { exact: true }).click();
  for (const view of ["Front", "Side", "Sole", "Inside", "Box"]) {
    await page.getByLabel(`${view} photo`, { exact: true }).setInputFiles({
      name: `${view}.png`,
      mimeType: "image/png",
      buffer: PNG,
    });
  }
  await page.getByLabel("Price", { exact: true }).fill("6000");
  await page.getByLabel("Expected lifespan (days)").fill("365");
  // S-curve by default; exponential decay is dearer new and ends at the same 30% of new.
  await expect(page.getByRole("radio", { name: /^S-curve/ })).toBeChecked();
  // The "?" explains how to choose: match the curve to how the pair's quality degrades.
  const help = page.getByRole("tooltip");
  await expect(help).toBeHidden();
  await page.getByRole("button", { name: "How to choose a pricing method" }).hover();
  await expect(help).toBeVisible();
  await expect(help).toContainText("Its price should fall the way its quality does.");
  await expect(help).toContainText("Choose exponential decay if the pair loses its fresh look");
  // It stays open while the pointer moves from the "?" onto it.
  const q = (await page
    .getByRole("button", { name: "How to choose a pricing method" })
    .boundingBox())!;
  const box = (await help.boundingBox())!;
  await page.mouse.move(q.x + q.width / 2, box.y + box.height / 2, { steps: 10 });
  await expect(help).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(help).toBeHidden();
  await page.getByRole("button", { name: "How to choose a pricing method" }).focus();
  await expect(help).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect(page.getByText("LKR 28.92 per day")).toBeVisible();
  await page.getByText("Exponential decay", { exact: true }).click();
  await expect(page.getByRole("radio", { name: /^Exponential decay/ })).toBeChecked();
  await expect(page.getByText("LKR 33.93 per day")).toBeVisible();
  await expect(page.getByText("LKR 10.18 per day")).toBeVisible();
  await expect(page.getByText("LKR 6,600.00")).toBeVisible(); // same lifetime share
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/merchant\/shoes\/\w+/);

  // The draft can switch back to the S-curve and the curve follows.
  await expect(page.getByText("LKR 33.93 → LKR 10.18")).toBeVisible();
  await page.getByText("S-curve (logistic decay)", { exact: true }).last().click();
  await page.getByRole("button", { name: "Save pricing method" }).click();
  await expect(page.getByText("LKR 28.92 → LKR 8.68")).toBeVisible();
  await page.getByText("Exponential decay", { exact: true }).click();
  await page.getByRole("button", { name: "Save pricing method" }).click();
  await expect(page.getByText("LKR 33.93 → LKR 10.18")).toBeVisible();

  // Published: the method is fixed and borrowers see it.
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save pricing method" })).toHaveCount(0);
  await signOut(page);

  await page.goto("/browse");
  await page.getByLabel("Search").fill("Clifton Decay");
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("link", { name: /Hoka Clifton Decay/ }).click();
  await expect(page.getByText(/Exponential decay, picked by the merchant/)).toBeVisible();
  await expect(page.locator("aside").getByText("LKR 33.93", { exact: true })).toBeVisible();
});

test("a pair with no brand or model, made for two experiences, shows under both", async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.merchant);
  await page.goto("/merchant/shoes/new");
  // Brand and model are optional.
  await expect(page.getByLabel("Brand (optional)")).not.toHaveAttribute("required", "");
  await page.getByLabel("To whom").selectOption("Women");
  await page.getByText("Work Day", { exact: true }).click();
  await page.getByText("Night Out", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Work Day" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Night Out" })).toBeChecked();
  await page.getByLabel("Size 1", { exact: true }).fill("5");
  for (const view of ["Front", "Side", "Sole", "Inside", "Box"]) {
    await page.getByLabel(`${view} photo`, { exact: true }).setInputFiles({
      name: `${view}.png`,
      mimeType: "image/png",
      buffer: PNG,
    });
  }
  await page.getByLabel("Price", { exact: true }).fill("4000");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/merchant\/shoes\/\w+/);
  await expect(page.getByRole("heading", { name: "Unbranded shoes" })).toBeVisible();
  await expect(page.getByText("Women · Work Day, Night Out")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await signOut(page);

  for (const experience of ["Work+Day", "Night+Out"]) {
    await page.goto(`/browse?for=women&experience=${experience}`);
    await expect(page.getByRole("link", { name: /Unbranded shoes/ })).toBeVisible();
  }
  await page.goto("/browse?for=women&experience=Morning+Run");
  await expect(page.getByRole("link", { name: /Unbranded shoes/ })).toHaveCount(0);
});

test("a merchant lists an upgraded second-hand pair; borrowers see its condition", async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.merchant);
  await page.goto("/merchant/shoes/new");
  await page.getByLabel("Brand").fill("Adidas");
  await page.getByLabel("Model").fill("Ultraboost Restored");
  await page.getByLabel("Size 1", { exact: true }).fill("8");
  await page.getByLabel("To whom").selectOption("Men");
  await page.getByText("Morning Run", { exact: true }).click();
  for (const view of ["Front", "Side", "Sole", "Inside", "Box"]) {
    await page.getByLabel(`${view} photo`, { exact: true }).setInputFiles({
      name: `${view}.png`,
      mimeType: "image/png",
      buffer: PNG,
    });
  }
  await page.getByLabel("Price", { exact: true }).fill("5000");
  // Wear used and upgrades are asked for only once the pair is second-hand / upgraded.
  await expect(page.getByLabel("Wear already used (days)")).toHaveCount(0);
  await page.getByLabel("Condition").selectOption("SECOND_HAND_UPGRADED");
  await page.getByLabel("Wear already used (days)").fill("100");
  await page.getByLabel("What was upgraded").fill("New insoles and laces");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/merchant\/shoes\/\w+/);
  await expect(page.getByText("Second-hand, upgraded: New insoles and laces")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await signOut(page);

  await page.goto("/browse");
  await page.getByLabel("Search").fill("Ultraboost Restored");
  await page.getByRole("button", { name: "Filter" }).click();
  const card = page.getByRole("link", { name: /Adidas Ultraboost Restored/ });
  await expect(card.getByText("Upgraded", { exact: true })).toBeVisible();
  await card.click();
  await expect(page.getByText(/Second-hand, upgraded/)).toBeVisible();
  await expect(page.getByText("New insoles and laces")).toBeVisible();
});

test("an unverified merchant can't publish until an admin verifies them", async ({ page }) => {
  const email = `newshop-${Date.now()}@test.local`;
  await page.goto("/sign-up?role=MERCHANT");
  await page.getByLabel("Full name").fill("New Shop Owner");
  await page.getByLabel("Business name").fill("Brand New Shop");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Pickup and return address").fill("Brand New Shop, 3 Main Street");
  await page.getByLabel("City").fill("Galle");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/awaiting verification/)).toBeVisible();
  await signOut(page);

  await signIn(page, ACCOUNTS.admin);
  await page.goto("/admin/merchants");
  const card = page
    .locator("div", { hasText: "Brand New Shop" })
    .filter({ has: page.getByRole("button", { name: /^(Verify|Revoke)$/ }) })
    .last();
  await expect(card.getByText("Pending")).toBeVisible();
  await card.getByRole("button", { name: "Verify" }).click();
  await expect(card.getByText("Verified")).toBeVisible();
});

test("Browse needs an account: signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/browse?experience=Morning+Run");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fbrowse%3Fexperience%3DMorning(\+|%20)Run/);
});

test("a size search says what the size is in the other systems", async ({ page }) => {
  await page.goto("/browse?size=UK+5");
  const box = page.getByRole("region", { name: "Size conversion" });
  await expect(box.getByRole("heading", { name: "UK 5 is the same as" })).toBeVisible();
  await expect(box.getByRole("row", { name: /Women's EU 38 US 7.5 24 cm/ })).toBeVisible();
  await expect(box.getByRole("row", { name: /Men's EU 38 US 5.5 23.5 cm/ })).toBeVisible();

  await box.getByRole("link", { name: "Size guide" }).click();
  await expect(page).toHaveURL("/size-guide?size=UK%205");
  // Highlighted on the women's chart: UK 5, EU 38, US 7.5, 24 cm.
  await expect(page.locator('tr[aria-current="true"]').first().locator("td")).toHaveText([
    "5",
    "38",
    "7.5",
    "24",
  ]);
});
