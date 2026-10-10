# Sneaker Rental Marketplace

Rent sneakers by the wear you actually use. Merchants list shoes, borrowers rent bundles of up to 4 pairs on a wear-based price curve, and ride-hailing drivers move the shoes.

- Business brief: [docs/business-model.md](docs/business-model.md)
- Pricing and wear maths: [docs/pricing-spec.md](docs/pricing-spec.md)
- Project rules and agents: [CLAUDE.md](CLAUDE.md), [.claude/agents/](.claude/agents/)

## Setup

Requires Node 24+. PostgreSQL comes from the `embedded-postgres` package, so there's nothing to install.

```bash
npm install
cp .env.example .env
npm run db:start            # local Postgres for dev (5544) and tests (5545)
npx prisma migrate deploy && npm run db:seed
npx playwright install chromium
npm run dev                 # http://localhost:3000
```

Sign in with any seed account (password `password123`): `admin@sneakers.test`, `kicks@sneakers.test` or `sole@sneakers.test` (merchants), `amaya@sneakers.test`, `ravi@sneakers.test` or `nimal@sneakers.test` (borrowers). To use your own PostgreSQL instead, change the URLs in `.env`.

## What's built (MVP, roadmap box 1)

| Area                                                                                  | Where                                                                              |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Pricing engine: curve per (V, L), charges, discounts, catch-up φ, split, R − F(w)     | `src/lib/pricing/`                                                                 |
| Wear ledger: 1/n daily split across pairs held, cap at L                              | `src/lib/wear-ledger/`                                                             |
| Sign-in, roles, merchant verification                                                 | `src/server/auth/`, `/admin/merchants`                                             |
| Listings with live price-curve preview, browse and filter                             | `src/server/catalogue/`, `/merchant/shoes/new`, `/browse`                          |
| Bundles of up to 4 pairs, checkout, direct handoff queue, condition photos, close-out | `src/server/booking/`, `/bundle`, `/rentals`                                       |
| Card pre-auth, deposit hold/release, charge at return, lost pairs (mock gateway)      | `src/server/payments/`                                                             |
| Deliveries booked by admin, courier links for drivers, signed webhook                 | `src/server/logistics/`, `/admin/deliveries`, `/courier/[token]`                   |
| Weekly merchant payouts, disputes                                                     | `src/server/payouts/`, `src/server/disputes/`, `/admin/payouts`, `/admin/disputes` |
| Pricing settings (append-only versions)                                               | `src/server/settings/`, `/admin/settings`                                          |

Not built yet (Phase 2/3): buy-out, idle discount ladder, borrower tiers, event packs, insights, membership, a real payment gateway and ride-hailing API.

## Architecture

Next.js 16 (App Router, server components and server actions) · PostgreSQL via Prisma 7 · decimal.js for every money and wear value. Pages call services in `src/server/<module>/`. Services call the pricing engine and wear ledger, which are pure and are the only code that computes prices, charges, shares or wear. Payment gateway, logistics provider, photo storage and bank transfers sit behind adapters, with a mock, the manual provider and local disk as the current implementations.

## Commands

| Command                                        | What it does                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                                  | Dev server                                                          |
| `npm run check`                                | Typecheck + lint + unit tests                                       |
| `npm test` / `npm run test:coverage`           | Vitest unit tests                                                   |
| `npm run test:int`                             | Integration tests on the test database                              |
| `npm run e2e`                                  | Playwright end-to-end tests (desktop + mobile) on the test database |
| `npm run db:start` / `db:stop` / `db:status`   | Local PostgreSQL servers                                            |
| `npm run db:migrate` / `db:seed` / `db:studio` | Prisma migrations, seed data, data browser                          |
| `npm run format`                               | Prettier                                                            |

## Open decisions

These are still open (business-model.md §10). Each one is a setting or an adapter, so it can change without code rewrites:

| Decision                                        | Where it lives                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Margin split (μm / μp)                          | `/admin/settings`                                                              |
| Deposit size                                    | `/admin/settings` (5,000 per pair now)                                         |
| Delivery booking fee, who pays for return trips | `/admin/settings`; `paidBy` on each delivery (free returns: platform)          |
| Handoffs without merchant cleaning              | Allowed now, in a sealed bag with a cleaning kit                               |
| Min / max declared lifespan                     | `LIFESPAN_MIN_DAYS` / `LIFESPAN_MAX_DAYS` in `src/server/catalogue` (30–1,500) |
| Catch-up pricing φ                              | `/admin/settings` (off)                                                        |
| Ride-hailing app and API                        | `src/server/logistics/provider.ts` (manual provider)                           |
| Payment gateway and pre-auth                    | `src/server/payments/gateway.ts` (mock)                                        |
| Platform name                                   | Placeholder "Sneaker Rental"                                                   |
