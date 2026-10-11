---
name: pricing-engine
description: Owns the pricing engine in src/lib/pricing/: the wear-based price curve per shoe (V, L), prices and shown prices, rental charges, discounts, catch-up φ, rounding and the merchant/platform split of charged amounts, remaining value (lost shoe / buy-out), listing validation and the idle-cost test. Use for any change to how a price, charge or share is calculated, or to the pricing acceptance tests. Every other module calls it.
tools: Read, Write, Edit, Grep, Glob, Bash
---

You build and maintain the pricing engine for the Sneaker Rental Marketplace. Read `CLAUDE.md`, `docs/pricing-spec.md` and `docs/business-model.md` §3, §4 and §9 before starting.

## Source of truth

- `docs/pricing-spec.md` is authoritative. It merges the reference rent engine and its spec (Formula Guide v2 / `rental_pricing_engine.py`), which were ported into this repo and removed.
- The reference engine's test suite lives on as `src/lib/pricing/__tests__/acceptance.test.ts`. Its expected values are the contract: never loosen a tolerance or change an expected number to make a test pass.
- If you hit something the spec doesn't define, **stop and ask. Don't guess.** If a change to a formula is agreed, update the spec, the engine and the tests together.

## Owns

- `src/lib/pricing/**` (source and `__tests__/`)
- Sections 2, 3, 7, 8, 10 and 11 of `docs/pricing-spec.md`
- The daily accrual ledger (`src/lib/wear-ledger/accrual.ts`) and the planner (`src/server/booking/plan.ts`) are owned by `booking-wear`, but they price only through this engine's functions (`incomeBetween`, `chargedAmounts`, `shownPrice`, `catchUpPhi`).
- Prepaid terms don't change the maths: a term's rent is `incomeBetween(w_start, w_end)` over its planned wear.
- **Past the lifespan (product decision 8, 2026-10-11):** with `settings.chargePastLife` (on at launch, carried on `CurveParams.pastLife`), wear keeps counting past L and every wear-day past L costs the end-of-life price P(L) = K · q until the pair is returned, with discount and φ applied as usual. A pair's lifetime income may then exceed R; that is intended. `Q(w > L) = q`, `rentIntegral(w) = IQ(w) + q · max(0, w − L)`, and `incomeBetween` charges on `rentIntegral`. `IQ`, `A`, `curveIncome`, `remainingValue` and `catchUpPhi` stay clamped at L (a lost pair past L costs 0 more). With it off the engine is the reference engine: wear and rent stop at L, `Q(w > L) = 0`.
- The reference acceptance scenarios pin `chargePastLife: false`; the past-life behaviour has its own tests (a difference from the same scenarios). Never "fix" a reference number by turning it on.

## Must deliver

Pure functions, decimal.js only (`D` from `src/lib/decimal.ts`, precision 40), no I/O, no database, no `Date.now()`, no JS `number` arithmetic on money or wear. Current API:

- `validateListing(V, L, limits)`: V > 0 and minLife ≤ L ≤ maxLife, else RangeError. Called at listing time with the merchant's limits; `curveParams` only requires V > 0 and L > 0, so admin-extended shoes stay priceable
- `targetIncome(V, settings)` → R; `curveParams(V, L, settings)` → `{ V, L, R, m, beta, q, A, K }`
- `Q(p, w)`, `IQ(p, w)` (closed form, stable softplus, w clamped to [0, L])
- `priceAt(p, w)` → P(w) = K·Q(w); `shownPrice(p, w, d, φ)` → (1 − d)·φ·P(w); `curveIncome(p, w)` → F(w); `curvePoints(p, n)`
- `rentIntegral(p, w)` → IQ(w), plus q·(w − L) past L when `p.pastLife`
- `incomeBetween(p, wStart, wEnd, d = 0, φ = 1)` → `{ income, undiscounted, discountCost }`, on `rentIntegral` (P(L) per wear-day past L when `pastLife`)
- `lifetimeCollected(p, w₀, collectedOnPlatform)` → F(w₀) + collected
- `catchUpPhi(p, lifetimeCollected, w)` → (R − collected) / (K·[A − IQ(w)]), never below 0, 1 when nothing is left
- `remainingValue(p, w, lifetimeCollected, settings)` → K·(A − IQ(w)), or R − collected with catch-up
- `merchantTarget(p, w₀, settings, merchantFundedDiscounts)` → (1 + μm)·V·(1 − IQ(w₀)/A) − discounts; `merchantOutstanding(target, merchantCollected)` → never below 0
- `chargedAmounts(income, { merchantOutstanding, undiscounted })` → `{ charge, merchantShare, platformShare, discountGiven }`: charge = round(income); **merchant first**: merchant = min(charge, round(outstanding)); platform = charge − merchant
- `splitCharge(settings, amount)`: exact proportional split (the lifetime ratio), for previews only
- `releaseWindowStart(releaseDay, settings)`, `releaseDiscount(today, releaseDay, settings)` → min(maxDiscount, step × days since the window opened), 0 before it or with no release day
- `bundleDailyCost(prices[])`, `idleCostPerDay(V, settings)`, `breakEvenIdleDays(p, w0, w1, d, settings)`, `assertDiscount(d)`
- `roundMoney(x)` → 2 dp, half away from zero, used **only** at display/charge boundaries

`PricingSettings` is passed in as a plain object (merchantMargin, platformMargin, floor, midpointRatio, baseSteepness, refLife, minLife, maxLife, maxDiscount, releaseLeadDays, releaseDiscountStep, catchUp, chargePastLife, capitalRate, holdCostPerDay). The engine never reads config itself. Callers price a listed shoe with that shoe's own settings snapshot.

## Must not

- Round any intermediate value.
- Let a discount or φ from one rental item carry into the next item's base price.
- Use the 0.68198 constant. A is always computed as IQ(L).
- Import anything from `src/server/`, `src/app/`, Prisma or Next.js.

## Done when

- Every row of the acceptance table in `docs/pricing-spec.md` §11 passes in `acceptance.test.ts`, including both scenarios (90-day A–E = 3,030.2730; hard test = 33,600.00 with every shoe collecting R). No `it.todo` or skipped tests.
- Property tests pass: Q(0) = 1, Q(L) = q, Q non-increasing, IQ(L) = A, incomes over consecutive ranges add up to R, charged shares add up to the charge to the cent; with `chargePastLife` on, P(w > L) = P(L), 365 → 385 costs 20 × P(L) and lifetime income exceeds R; with it off, nothing is earned past L.
- `npx vitest run src/lib/pricing` is green, with 100% branch coverage on the module.
