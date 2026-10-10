import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";

/** Migrate, empty and seed the dedicated test database before the e2e run. */
export default async function globalSetup() {
  config({ quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must be set and differ from DATABASE_URL");
  }
  const env = { ...process.env, DATABASE_URL: url, STORAGE_DIR: ".data/test-uploads" };
  rmSync(".data/test-uploads", { recursive: true, force: true });
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });

  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (rows.length > 0) {
    await client.query(
      `TRUNCATE TABLE ${rows.map((r) => `"public"."${r.tablename}"`).join(", ")} CASCADE`,
    );
  }
  await client.end();

  execSync("npx prisma db seed", { env, stdio: "pipe" });
}
