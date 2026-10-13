import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ quiet: true });

const PORT = 3100;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "tests/e2e/global-setup.ts",
  // Journeys share one seeded database, so files run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  timeout: 90_000,
  // The dev server compiles each route on first visit, which can take several seconds.
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // The welcome animation covers the home page for first-time visitors; tests skip it.
    storageState: {
      cookies: [
        {
          name: "nova_intro_seen",
          value: "1",
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Borrowers and drivers are on phones (see frontend agent).
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile\.spec\.ts|home\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Never reuse: an existing server on this port could point at the dev database.
    reuseExistingServer: false,
    timeout: 180_000,
    // Links in emails (password reset) point at this server.
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      STORAGE_DIR: ".data/test-uploads",
      APP_URL: `http://localhost:${PORT}`,
    },
  },
});
