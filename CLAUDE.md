# Sneaker Rental Marketplace

An asset-light marketplace for renting sneakers by wear. Merchants list shoes, borrowers rent bundles of up to 4 pairs and pay per wear-day on a falling price curve, ride-hailing drivers move the shoes, and the platform runs pricing, booking, payments, payouts and trust. We own no shoes and run no couriers.

- Full brief: [docs/business-model.md](docs/business-model.md). Cite sections as §n.
- Rent calculation spec (authoritative for pricing and wear): [docs/pricing-spec.md](docs/pricing-spec.md). It merges the reference rent engine (Formula Guide v2 / `rental_pricing_engine.py`), whose tests now live in `src/lib/pricing/__tests__/acceptance.test.ts`.

## Stack

Next.js (App Router) + TypeScript · PostgreSQL + Prisma · decimal.js for every money and wear value · Vitest (unit) + Playwright (e2e) · object storage for photos behind an adapter · payment gateway behind an adapter (PayHere is a candidate; pre-auth support still unconfirmed, so ship a mock first).

Versions: Next 16.4, React 19.3, Prisma 7.10 (config in `prisma.config.ts`, client generated to `src/generated/prisma`, uses the `@prisma/adapter-pg` driver adapter), Vitest 5, Playwright 1.64. Next 16 differs from older versions, so read @AGENTS.md before writing Next.js code.

Shared decimal helper: `src/lib/decimal.ts` (`D`, `toD`, `roundMoney`). Use it rather than creating new Decimal configs. Convert Prisma Decimals with `toD`, never via `Number()`.

Conventions:

- **Cache Components is off** (`next.config.ts`). Pages that read the session render dynamically. Don't add `"use cache"`.
- **Auth:** call `requireUser(...roles)` from `src/server/auth/session.ts` at the top of every page, server action and route handler that needs a user. It redirects on failure. Sessions are random tokens in an httpOnly cookie, stored as SHA-256 hashes.
- **Server code** lives in `src/server/<module>/`, imports `server-only`, and uses `db` from `src/server/db.ts`. Pages call services; services hold the business logic and are integration-tested.
- **Prisma 7:** `prisma migrate dev` does not regenerate the client, so use `npm run db:migrate` (migrate + generate).
- **Settings:** a listed shoe is priced with the settings version it was listed under (`Shoe.settingsId`). Use `shoeCurve(shoe)` / `shoePricing(shoe)` from `src/server/catalogue/pricing.ts` (include `settings: true` in the query). `getActiveSettings()` is for operational values (deposit, bundle size, windows, fees), new listings and previews.
- **Days:** wear-ledger days are Asia/Colombo calendar dates in `RentalItem.firstDay` / `lastDay`, both counted. The first day is the delivery day; the last day is the day the borrower presses End rental, so waiting for the driver is free. A handoff receiver starts on the delivery day, or the day after the giver's last day if that is later.

## Databases

`npm run db:start` runs two local PostgreSQL 18 servers from the embedded-postgres binaries (no install, no password, data in `.data/pg/`): dev on port 5544 and test on 5545. The test runs wipe the test database. `npm run db:stop` / `db:status` manage them. Both URLs are in `.env`. Inside `db.$transaction(async (tx) => …)` use only `tx`, never `db`. Seed accounts all use password `password123`: admin@, kicks@ / sole@ (merchants), amaya@ / ravi@ / nimal@ (borrowers), all `@sneakers.test`.

(Prisma's `prisma dev` PGlite server was tried first and crashed under repeated test runs, so don't go back to it.)

## Commands

`npm run dev` · `npm run check` (typecheck + lint + unit tests) · `npm test` (unit) · `npm run test:int` (integration, test DB) · `npm run e2e` (Playwright on port 3100, test DB) · `npm run db:migrate` · `npm run db:seed` · `npm run format`

## Hard rules (§9)

1. **Prices and wear come only from the pricing engine (`src/lib/pricing/`) and the wear ledger (`src/lib/wear-ledger/`).** No other module computes a price, a charge, a share or a wear value. Adding up engine outputs (a shoe's collected total, payment and payout sums) is bookkeeping and is fine; deriving a new price, share or wear figure is not. Charged amounts come from `chargedAmounts()`: charge rounded, then **merchant first**: the merchant's share fills what they are still owed of (1 + μm) × V, and the platform gets the rest.
2. **Keep values unrounded; round only what is shown or charged, to 2 decimals.** No JS `number` for money or wear. Use decimal.js in code and `Decimal` in Prisma.
3. **Discounts never stack.** Always start from the curve price at the shoe's current wear.
4. **Exact curve ratios:** m = 200·L/365, β = 0.03·365/L, q = 0.30.

## Build order

Status: steps 0–8 are done (MVP complete), and step 9 aligned the app with the rent calculation spec. The step branches are on GitHub.

pricing engine → schema and roles → catalogue → booking and wear ledger → payments → logistics → payouts and disputes → polish

## Scope

Build the **MVP only** (§10 roadmap): pricing engine and tests, listings with curve preview, bundles of up to 4 pairs, booking and wear ledger, card pre-auth and deposits, deliveries booked by admin, direct handoffs, weekly merchant payouts. Phase 2/3 features (buy-out, idle discount ladder, tiers, event packs, membership, etc.) stay out until asked for. Keep the data model ready for them.

## Launch defaults (all configurable; never hard-coded outside settings)

| Setting                                 | Default                | Note                                                            |
| --------------------------------------- | ---------------------- | --------------------------------------------------------------- |
| μm / μp                                 | 0.10 / 0.10            | Open decision: the split may change                             |
| Floor q, midpoint ratio, base steepness | 0.30, 200/365, 0.03    | PricingSettings; reference lifespan 365                         |
| Declared lifespan limits                | 6–24 months (183–730)  | Admin can extend a merchant's maximum on request                |
| φ (catch-up)                            | 1, off                 | Discounts funded from margin                                    |
| Deposit                                 | 5,000 LKR × pairs held | §2 fixes it; §10 still lists it as open, so keep it in settings |
| Max pairs per bundle                    | 4                      |                                                                 |
| Dispute window / payout hold            | 3 days after close     |                                                                 |
| Payout cadence                          | Weekly                 |                                                                 |
| Idle discount cap                       | 5%                     | Phase 2 feature; setting exists now                             |
| Idle-cost test r / h                    | 0.12 / 0 LKR a day     | Phase 2; r is an assumption                                     |
| Currency / timezone                     | LKR / Asia/Colombo     |                                                                 |
| Delivery booking fee                    | TBD                    | Open decision                                                   |

Open decisions are listed in §10. When code depends on one, read it from settings and leave a `// OPEN DECISION:` comment. Don't pick a value silently.

## Agents

Seven subagents live in `.claude/agents/`, each owning specific directories: `pricing-engine`, `backend-data`, `booking-wear`, `logistics`, `payments-payouts`, `frontend`, `qa-review`. An agent edits only its own directories. Cross-module changes go through the owning agent or an agreed interface. `qa-review` must pass before any merge.
