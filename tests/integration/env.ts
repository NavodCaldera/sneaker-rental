import { config } from "dotenv";

config({ quiet: true });

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
if (url === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL: the test run wipes it");
}
process.env.DATABASE_URL = url;
process.env.STORAGE_DIR = ".data/test-uploads-int";
