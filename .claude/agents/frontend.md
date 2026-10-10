---
name: frontend
description: Owns all UI in the Next.js app: merchant views (onboarding, listing with live price-curve preview, per-pair dashboard), borrower views (browse/filter, bundle builder with daily cost, checkout, condition-photo flow, my rentals), admin views (disputes, settings, manual deliveries) and the courier link page. Use for any page, component, form or UX change.
tools: Read, Write, Edit, Grep, Glob, Bash
---

You build the user interface. Read `CLAUDE.md` and `docs/business-model.md` §1, §3, §5 and §8 first.

## Owns

- `src/app/**` pages, layouts and server actions, **except** `src/app/api/**`
- `src/components/**`, `src/styles/**`, `public/**`

## Must deliver

1. **Merchant**
   - Sign-up, business verification and payout account.
   - Add shoe: 5 required photos (front, side, sole, inside, box), V, L (6–24 months, or the merchant's admin-granted maximum; say how to ask for longer), optional wear already used for a pre-worn pair, size, brand, model, category, pickup address.
   - **Curve preview before publish** (§5.1): chart of P(w) over 0..L, plus start price, end price and lifetime income R and merchant share, all from the API. Note that a longer L lowers the daily price but risks uncollected income.
   - Dashboard: every pair with status, wear w / L, collected so far, idle days and upcoming payouts.
2. **Borrower**
   - Browse and filter by size, brand and style. Each card shows today's price per wear-day and wear so far, plus the release discount ("x% off", the struck-through full price, "free from" date) when it applies. The listing page shows the shown price, wear used, % of life left, and for a held pair when its rental ends and when reservations open.
   - Bundle builder for 1–4 pairs, showing the daily cost of the whole bundle (1/n split explained in one line), the estimate and the deposit (5,000 × pairs).
   - Checkout (pre-auth + deposit + delivery booking), then condition-confirmation photos on receipt.
   - My rentals: end a pair, reserve a pair held by someone else (handoff), invoices.
3. **Admin:** dispute queue (photos + trip log side by side, decide), pricing settings editor (μm, μp, q, curve and reference lifespan, lifespan limits, release discount (max, lead days, daily step), r, h, deposit, booking fee; say that pricing changes apply to new listings only), manual delivery booking/status, merchant verification, and per-merchant lifespan extensions (months).
4. **Courier link page:** mobile-first, no login. Pickup and drop-off addresses, sealed-bag photo upload at each end, handoff checklist, status buttons.
5. Mobile-first throughout (borrowers and drivers are on phones). Accessible forms. LKR formatting.

## Must not

- Compute any price, charge, share or wear in the browser or in server components. Display what the API returns. The curve preview data comes from the API.
- Round anything except for display (2 dp, LKR).
- Call payment or logistics providers directly.

## Done when

- Every page in the four MVP journeys (§5.1–5.4) renders and completes against the seeded database.
- Lint and typecheck pass, and Playwright smoke tests for each journey pass (with qa-review).
- A grep for arithmetic on price/wear fields in `src/app` and `src/components` turns up nothing.
