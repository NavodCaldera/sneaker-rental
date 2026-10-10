# Sneaker Rental Marketplace

An asset-light marketplace for renting sneakers by wear. Merchants list shoes, borrowers rent bundles of up to 4 pairs and pay per wear-day on a falling price curve, ride-hailing drivers move the shoes, and the platform runs pricing, booking, payments, payouts and trust. We own no shoes and run no couriers.

- Full brief: [docs/business-model.md](docs/business-model.md). Cite sections as §n.
- Pricing and wear maths: [docs/pricing-spec.md](docs/pricing-spec.md)
- Authoritative pricing source (when present): `docs/rental_pricing_engine.py`, `docs/Rental Pricing Formula Guide v2`

## Stack

Next.js (App Router) + TypeScript · PostgreSQL + Prisma · decimal.js for every money and wear value · Vitest (unit) + Playwright (e2e) · object storage for photos behind an adapter · payment gateway behind an adapter (PayHere is a candidate; pre-auth support still unconfirmed, so ship a mock first).

Versions: Next 16.4, React 19.3, Prisma 7.10 (config in `prisma.config.ts`, client generated to `src/generated/prisma`, uses the `@prisma/adapter-pg` driver adapter), Vitest 5, Playwright 1.64. Next 16 differs from older versions, so read @AGENTS.md before writing Next.js code.

Shared decimal helper: `src/lib/decimal.ts` (`D`, `roundMoney`). Use it rather than creating new Decimal configs.

## Commands

`npm run dev` · `npm run check` (typecheck + lint + unit tests) · `npm test` · `npm run e2e` · `npm run db:migrate` · `npm run db:seed` · `npm run format`

## Hard rules (§9)

1. **Prices and wear come only from the pricing engine (`src/lib/pricing/`) and the wear ledger (`src/lib/wear-ledger/`).** No other module computes a price, a charge, a share or a wear value.
2. **Keep values unrounded; round only what is shown or charged, to 2 decimals.** No JS `number` for money or wear. Use decimal.js in code and `Decimal` in Prisma.
3. **Discounts never stack.** Always start from the curve price at the shoe's current wear.
4. **Exact curve ratios:** m = 200·L/365, β = 0.03·365/L, q = 0.30.

## Build order

pricing engine → schema and roles → catalogue → booking and wear ledger → payments → logistics → payouts and disputes → polish

## Scope

Build the **MVP only** (§10 roadmap): pricing engine and tests, listings with curve preview, bundles of up to 4 pairs, booking and wear ledger, card pre-auth and deposits, deliveries booked by admin, direct handoffs, weekly merchant payouts. Phase 2/3 features (buy-out, idle discount ladder, tiers, event packs, membership, etc.) stay out until asked for. Keep the data model ready for them.

## Launch defaults (all configurable; never hard-coded outside settings)

| Setting                                 | Default                | Note                                                            |
| --------------------------------------- | ---------------------- | --------------------------------------------------------------- |
| μm / μp                                 | 0.10 / 0.10            | Open decision: the split may change                             |
| Floor q, midpoint ratio, base steepness | 0.30, 200/365, 0.03    | PricingSettings                                                 |
| φ (catch-up)                            | 1, off                 | Discounts funded from margin                                    |
| Deposit                                 | 5,000 LKR × pairs held | §2 fixes it; §10 still lists it as open, so keep it in settings |
| Max pairs per bundle                    | 4                      |                                                                 |
| Dispute window / payout hold            | 3 days after close     |                                                                 |
| Payout cadence                          | Weekly                 |                                                                 |
| Idle discount cap                       | 5%                     | Phase 2 feature; setting exists now                             |
| Currency / timezone                     | LKR / Asia/Colombo     |                                                                 |
| Delivery booking fee                    | TBD                    | Open decision                                                   |

Open decisions are listed in §10. When code depends on one, read it from settings and leave a `// OPEN DECISION:` comment. Don't pick a value silently.

## Agents

Seven subagents live in `.claude/agents/`, each owning specific directories: `pricing-engine`, `backend-data`, `booking-wear`, `logistics`, `payments-payouts`, `frontend`, `qa-review`. An agent edits only its own directories. Cross-module changes go through the owning agent or an agreed interface. `qa-review` must pass before any merge.
