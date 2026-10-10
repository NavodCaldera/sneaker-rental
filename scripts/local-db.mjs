#!/usr/bin/env node
/**
 * Local PostgreSQL for development and tests, from the embedded-postgres binaries.
 * No system install or password needed; data lives in .data/pg/<name>.
 *
 *   node scripts/local-db.mjs start [dev|test|all]   (default: all)
 *   node scripts/local-db.mjs stop  [dev|test|all]
 *   node scripts/local-db.mjs status
 *
 * dev  → postgres://postgres@localhost:5544/sneaker_rental
 * test → postgres://postgres@localhost:5545/sneaker_rental_test
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";

const CLUSTERS = {
  dev: { port: 5544, database: "sneaker_rental" },
  test: { port: 5545, database: "sneaker_rental_test" },
};

const PLATFORM = { win32: "windows", darwin: "darwin", linux: "linux" }[process.platform];
const binaries = await import(`@embedded-postgres/${PLATFORM}-${process.arch}`).catch(() => {
  console.error(
    `No embedded-postgres binaries for ${process.platform}-${process.arch}. Use a system PostgreSQL instead.`,
  );
  process.exit(1);
});

const root = resolve(".data/pg");
const dirFor = (name) => join(root, name);

function run(bin, args, { detached = false } = {}) {
  // The server inherits stdio from pg_ctl; with pipes, execFileSync would wait for the
  // server to exit. Starting it with stdio ignored (output goes to server.log) avoids that.
  return execFileSync(bin, args, { stdio: detached ? "ignore" : "pipe", encoding: "utf8" });
}

function isRunning(name) {
  if (!existsSync(join(dirFor(name), "PG_VERSION"))) return false;
  try {
    run(binaries.pg_ctl, ["status", "-D", dirFor(name)]);
    return true;
  } catch {
    return false;
  }
}

async function start(name) {
  const { port, database } = CLUSTERS[name];
  const dir = dirFor(name);
  if (!existsSync(join(dir, "PG_VERSION"))) {
    mkdirSync(dir, { recursive: true });
    // Local only: trust auth on localhost, no password.
    run(binaries.initdb, ["-D", dir, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--no-locale"]);
    console.log(`Initialised ${name} cluster in ${dir}`);
  }
  if (isRunning(name)) {
    console.log(`${name}: already running on port ${port}`);
  } else {
    run(
      binaries.pg_ctl,
      [
        "start",
        "-D",
        dir,
        "-l",
        join(dir, "server.log"),
        "-w",
        "-o",
        `-p ${port} -c listen_addresses=localhost -c max_connections=50`,
      ],
      { detached: true },
    );
    console.log(`${name}: started on port ${port}`);
  }
  const client = new pg.Client({
    connectionString: `postgres://postgres@localhost:${port}/postgres`,
  });
  await client.connect();
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
    database,
  ]);
  if (!rowCount) {
    await client.query(`CREATE DATABASE "${database}"`);
    console.log(`${name}: created database ${database}`);
  }
  await client.end();
}

function stop(name) {
  if (!isRunning(name)) return console.log(`${name}: not running`);
  run(binaries.pg_ctl, ["stop", "-D", dirFor(name), "-m", "fast", "-w"]);
  console.log(`${name}: stopped`);
}

const [command = "status", target = "all"] = process.argv.slice(2);
const names = target === "all" ? Object.keys(CLUSTERS) : [target];
if (!names.every((n) => n in CLUSTERS)) {
  console.error(`Unknown cluster "${target}". Use dev, test or all.`);
  process.exit(1);
}

if (command === "start") for (const n of names) await start(n);
else if (command === "stop") for (const n of names) stop(n);
else if (command === "status") {
  for (const n of Object.keys(CLUSTERS)) {
    console.log(`${n}: ${isRunning(n) ? `running on port ${CLUSTERS[n].port}` : "stopped"}`);
  }
} else {
  console.error("Usage: node scripts/local-db.mjs start|stop|status [dev|test|all]");
  process.exit(1);
}
