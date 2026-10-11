# Sneaker Rental Marketplace

An asset-light marketplace for renting sneakers by wear. Merchants list shoes, borrowers rent bundles of up to 4 pairs and pay per wear-day on a falling price curve, ride-hailing drivers move the shoes, and the platform runs pricing, booking, payments, payouts and trust. We own no shoes and run no couriers.

- Full brief: [docs/business-model.md](docs/business-model.md). Cite sections as §n.
- Rent calculation spec (authoritative for pricing and wear): [docs/pricing-spec.md](docs/pricing-spec.md). It merges the reference rent engine (Formula Guide v2 / `rental_pricing_engine.py`), whose tests now live in `src/lib/pricing/__tests__/acceptance.test.ts`.

## Stack

Next.js (App Router) + TypeScript · PostgreSQL + Prisma · decimal.js for every money and wear value · Vitest (unit) + Playwright (e2e) · object storage for photos behind an adapter · payment gateway behind an adapter for token top-ups (sales) and withdrawals (refunds); PayHere is a candidate, the mock ships first.

Versions: Next 16.4, React 19.3, Prisma 7.10 (config in `prisma.config.ts`, client generated to `src/generated/prisma`, uses the `@prisma/adapter-pg` driver adapter), Vitest 5, Playwright 1.64. Next 16 differs from older versions, so read @AGENTS.md before writing Next.js code.

Shared decimal helper: `src/lib/decimal.ts` (`D`, `toD`, `roundMoney`). Use it rather than creating new Decimal configs. Convert Prisma Decimals with `toD`, never via `Number()`.

Conventions:

- **Cache Components is off** (`next.config.ts`). Pages that read the session render dynamically. Don't add `"use cache"`.
- **Auth:** call `requireUser(...roles)` from `src/server/auth/session.ts` at the top of every page, server action and route handler that needs a user. It redirects on failure. Sessions are random tokens in an httpOnly cookie, stored as SHA-256 hashes.
- **Server code** lives in `src/server/<module>/`, imports `server-only`, and uses `db` from `src/server/db.ts`. Pages call services; services hold the business logic and are integration-tested.
- **Prisma 7:** `prisma migrate dev` does not regenerate the client, so use `npm run db:migrate` (migrate + generate).
- **Settings:** a listed shoe is priced with the settings version it was listed under (`Shoe.settingsId`). Use `shoeCurve(shoe)` / `shoePricing(shoe)` from `src/server/catalogue/pricing.ts` (include `settings: true` in the query). `getActiveSettings()` is for operational values (token cover, bundle size, windows, fees), new listings and previews.
- **Brand (product owner, 2026-10-11):** the site is called **Shoe Rental**, and UI text says "shoes", never "sneakers". The only website colours are pure white (#FFFFFF), pure black (#000000) and one blue, **#35D6ED**: tokens in `src/app/globals.css` (`paper`, `ink`, `accent`, `on-accent`; greys are black or white at low opacity; `good` / `warn` / `danger` / `info` map onto black or white). The blue is a fill (primary buttons, the sign-up button, search button, good badges, the logo mark, the price chart) with black text on it (`text-on-accent`); never blue text on white (contrast too low). Status shows by shape, not colour: good = blue pill, problem = black pill or black-outlined alert, warning = outlined. Don't add another colour. Photos and emoji icons are content, not palette. **Day and night mode:** every colour token is `light-dark(day, night)` in `globals.css`; the page follows the device setting until the visitor uses the header switch (`ThemeToggle`, sun/moon, "Switch to night mode" / "Switch to day mode"), which sets `data-theme` on `<html>` and a `theme` cookie (1 year) that the root layout reads, so the server renders the picked mode with no flash. Night mode is black background, white text, the same blue. New colours go in as `light-dark()` tokens, never as `dark:` classes.
- **Sizes (product owner, 2026-10-11):** a merchant lists a pair in the size on its label, **UK, EU or US** (`Shoe.sizeSystem` + number; `size` is the label, e.g. "EU 39"), and we store the same size in every system, `sizeUk` / `sizeEu` / `sizeUs` / `sizeCm` (cm = foot length), from the product owner's charts in `src/lib/shoe-size.ts` (`shoeSizeFields`): women's pairs use the women's chart, men's and unisex the men's. Kids' pairs and sizes off the chart keep only the listed system (no kids' chart yet). Changing who a pair is for re-reads its label size on the new chart. Borrowers search in any system (`?size=UK 6`, `EU 39`, `US 8.5`, `24.5 cm`) and find a pair however it was listed; a size search shows what that size is in the other systems on each chart (`SizeEquivalence`), cards show the listed size plus the borrower's system (`sizeSummary`, e.g. "EU 39 · UK 6"), the listing shows all four (`ShoeSizePanel`), and `/size-guide` shows both charts with the size highlighted. Never edit the charts without the product owner.
- **Forgot password (product owner, 2026-10-11):** "Forgot password?" on sign-in → `/forgot-password` emails a one-time link (`requestPasswordReset`, `src/server/auth/password-reset.ts`) valid 60 minutes, at most one email per account a minute; the page says the same thing whether or not the email has an account. `/reset-password?token=` sets the new password (`resetPassword`): the link and every other open link stop working and all sessions are signed out; then sign-in shows "Your password has been changed". Only the token's SHA-256 is stored (`PasswordReset`). Links use `APP_URL`, never the request's Host header. With the mock mailer outside production, the page shows the link, since no email really goes out.
- **Addresses:** Each customer and merchant account has **exactly one address** and its **city** (separate fields, both required at sign-up) with the reason shown next to the field (customers: where pairs are delivered and collected; merchants: where pairs are picked up and returned). It can be changed later on the account page (`/account`, `/merchant/account`); trips copy the addresses when they are booked, so a change applies to trips booked after it. There is no address at checkout or per listing (product owner, 2026-10-11). Trips use "address, city" (`fullAddress` in `src/lib/address.ts`) through `customerAddress` / `merchantAddress` (`src/server/booking/addresses.ts`); a customer without one can't book and a merchant without one can't list.
- **Trips:** delivery fees are not handled by us. Whoever receives the pair pays the driver directly in the ride-hailing app: the borrower for deliveries, the next borrower for handoffs, the merchant for returns (`Delivery.paidBy`, set by `receiverPays`). Never charge, collect or refund a trip fee in tokens, and there is no booking fee.
- **Days:** wear-ledger days are Asia/Colombo calendar dates in `RentalItem.firstDay` / `lastDay`, both counted. Day 1 is the day after delivery (the delivery day is free); the last day is the day the borrower presses End rental, or the term's last day (`termEndDay`), so waiting for the driver is free. A handoff receiver starts the day after delivery, or the day after the giver's last day if that is later.
- **Fixed terms, post-paid rent (pricing-spec.md §6, §6a, §7):** a borrower books a term; nothing is charged at booking. Each pair's value is locked as its own deposit (purpose `DEPOSIT`) and its rent estimate beside it (`RENT`, `rentLocked`), both until that pair's item closes; `closeItem` then calls `collectRent` (release the rent lock, charge the actual rent) in the same transaction, so a merchant share is payable only once the rent is collected. Only available tokens can be withdrawn. An early return needs `earlyReturnNoticeDays` (10) notice (`scheduleEarlyReturn`); only the free-return window or the term's last day ends at once. A pair can be booked for any term while `committedWear` < L, never after; past L each wear-day is charged at the end-of-life price P(L) until it is returned (`chargePastLife`). Each pair's `committedWear` (what listings show, and what the next borrower is priced at) includes every open booking's planned wear. Anything that changes a plan (delivery, early-return notice, extension, a new overlapping booking, cancellation, lost pair, close) calls `replan` (`src/server/booking/plan.ts`), which moves each rent lock to the new estimate, or makes an offer (new first day and price) to a reserved-next borrower whose start moves earlier or whose estimate goes up. A held pair can be reserved from its holder's day 1; a declined or expired offer cancels the reservation, unlocks everything and emails the borrower, and the pair stays with its holder, free, until a new borrower books it (`holdForNext`; never collected meanwhile). The daily job (`runDailyRentals`, `/api/cron/rentals`) ends terms that ran out and expires offers. Notices go through `notify` (in-app, plus email via the mock mailer).

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

Status: steps 0–8 are done (MVP complete), and step 9 aligned the app with the rent calculation spec. Steps 10–12 added merchant first, the release discount and the token wallet; step 13 made rentals fixed-term; step 14 made rent post-paid (locked at booking, charged at return) and opened reservations from the holder's day 1; step 15 added the listing condition, then the site got its home page, accounts with one address and city, the blue/white/black palette and day/night mode. All of it is on `main`.

pricing engine → schema and roles → catalogue → booking and wear ledger → payments → logistics → payouts and disputes → polish

## Scope

Build the **MVP only** (§10 roadmap): pricing engine and tests, listings with curve preview, bundles of up to 4 pairs, booking and wear ledger, a token wallet (replaces card pre-auth and deposits), deliveries booked by admin, direct handoffs, weekly merchant payouts. The release discount for the next borrower was built on request (pricing-spec.md §8). Phase 2/3 features (buy-out, merchant idle discounts, tiers, event packs, membership, etc.) stay out until asked for. Keep the data model ready for them.

## Launch defaults (all configurable; never hard-coded outside settings)

| Setting                                 | Default                                               | Note                                                                      |
| --------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| μm / μp                                 | 0.10 / 0.10                                           | Open decision: the split may change                                       |
| Floor q, midpoint ratio, base steepness | 0.30, 200/365, 0.03                                   | PricingSettings; reference lifespan 365                                   |
| Declared lifespan limits                | 6–24 months (183–730)                                 | Admin can extend a merchant's maximum on request                          |
| φ (catch-up)                            | 1, off                                                | Discounts funded from margin                                              |
| Past the lifespan                       | Charged at P(L) per wear-day until returned           | `chargePastLife`; lifetime may exceed R (the platform gets the excess)    |
| At booking                              | Each pair's V + rent estimate locked; nothing charged | Rent charged at return; deposit stays at full V until that pair is back   |
| Early-return notice                     | 10 days before the new last day                       | Wrong-size returns within 24 h end at once                                |
| Max pairs per bundle                    | 4                                                     |                                                                           |
| Dispute window / payout hold            | 3 days after close                                    |                                                                           |
| Payout cadence                          | Weekly                                                |                                                                           |
| Release discount                        | +0.5%/day from 10 days before release, max 10%        | Next borrower only; platform-funded (open decision)                       |
| Offer response time                     | 24 hours                                              | Reserved-next borrower accepting a higher price (open decision)           |
| Idle-cost test r / h                    | 0.12 / 0 LKR a day                                    | Phase 2; r is an assumption                                               |
| Currency / timezone                     | LKR / Asia/Colombo                                    |                                                                           |
| Trip fees                               | Not handled by us                                     | Receiver pays the driver: borrower (delivery, handoff), merchant (return) |

Open decisions are listed in §10. When code depends on one, read it from settings and leave a `// OPEN DECISION:` comment. Don't pick a value silently.

## Agents

Seven subagents live in `.claude/agents/`, each owning specific directories: `pricing-engine`, `backend-data`, `booking-wear`, `logistics`, `payments-payouts`, `frontend`, `qa-review`. An agent edits only its own directories. Cross-module changes go through the owning agent or an agreed interface.

**Git workflow (product owner, 2026-10-11): update `main` after every commit, locally and on GitHub.** Work on a short-lived branch (or on `main`), run `npm run check` and `npm run test:int` (and `npm run e2e` when port 3100 is free) before committing, then merge the commit into local `main` (`--no-ff` for a branch) and `git push origin main` straight away. Local `main` and `origin/main` must never be left behind the latest commit. `qa-review` reviews `main` when asked; it no longer gates merges.
