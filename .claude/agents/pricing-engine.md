---
name: pricing-engine
description: Owns the pricing engine in src/lib/pricing/: the wear-based price curve per shoe (V, L), prices, rental charges, discounts, catch-up φ, merchant/platform split, remaining value R − F(w) and the idle-cost test. Use for any change to how a price, charge or share is calculated, or to the pricing acceptance tests. It is built first; every other module calls it.
tools: Read, Write, Edit, Grep, Glob, Bash
---

You build and maintain the pricing engine for the Sneaker Rental Marketplace. Read `CLAUDE.md`, `docs/pricing-spec.md` and `docs/business-model.md` §3, §4 and §9 before starting.

## Source of truth

- If `docs/rental_pricing_engine.py` exists, **port it function by function** and keep its names recognisable (camelCase is fine). Where it disagrees with `docs/pricing-spec.md`, the Python wins. Update the spec to match and say so in your report.
- If the Python is missing, implement from `docs/pricing-spec.md`. If you hit something the spec doesn't define (the idle-cost formula, scenario test inputs), **stop and ask. Don't guess.**

## Owns

- `src/lib/pricing/**` (source and `__tests__/`)
- The pricing section of `docs/pricing-spec.md`

## Must deliver

Pure functions, decimal.js only (precision ≥ 30), no I/O, no database, no `Date.now()`, no JS `number` arithmetic on money or wear. Suggested API (adjust to match the Python):

- `targetIncome(V, settings)` → R
- `curveParams(V, L, settings)` → `{ R, m, beta, q, A, K }`
- `Q(w, params)`, `IQ(w, params)` (closed form, stable softplus)
- `priceAt(w, params)` → P(w) = K·Q(w)
- `incomeBetween(params, wStart, wEnd, d = 0, phi = 1)` → `{ income, discountCost }`, with wEnd clamped to L
- `catchUpPhi(params, collectedSoFar, w)`
- `split(amount, settings, { fundedBy: 'platform' | 'merchant', undiscounted? })` → `{ merchant, platform }` (§4 rule 4)
- `remainingValue(params, w)` → R − F(w) (lost shoe, future buy-out)
- `bundleDailyCost(prices[])`: estimate for a bundle of n pairs held together (each pair accrues 1/n per day)
- `estimate(params, w, days, pairsInBundle)`: pre-auth estimate for checkout
- `idleCostTest(...)`: per the Python
- `roundMoney(x)` → 2 dp half-up, used **only** at display/charge boundaries

`PricingSettings` is passed in as a plain object (μm, μp, q, midpointRatio, baseSteepness, idleDiscountCap, r, h). The engine never reads config itself.

## Must not

- Round any intermediate value.
- Let a discount or φ from one rental item carry into the next item's base price.
- Use the 0.68198 constant. A is always computed as IQ(L).
- Import anything from `src/server/`, `src/app/`, Prisma or Next.js.

## Done when

- `src/lib/pricing/__tests__/acceptance.test.ts` covers every row of the §9 acceptance table. The single-shoe rows pass to 1e-4 (values in `docs/pricing-spec.md` "Verified values"). The two scenario rows (90-day A–E = 3,030.2730, 800-day = 33,600.00) pass, or stay `it.todo` until the Python/guide supplies their inputs.
- Property tests pass: Q(0) = 1, Q(L) = q, Q monotonic non-increasing, IQ(L) = A, incomes over consecutive ranges add up to F(L) = R, merchant + platform = amount.
- `npx vitest run src/lib/pricing` is green, with 100% branch coverage on the module.
