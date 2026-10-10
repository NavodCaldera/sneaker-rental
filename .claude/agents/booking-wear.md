---
name: booking-wear
description: Owns booking and the wear ledger: bundles of 1–4 pairs, reservations and estimates, the direct-handoff queue, holding periods and their inclusive ledger days, the 1/n daily wear split capped at L (phase-based and daily accrual), condition reports at handover, and the rental-item close-out flow that hands w_start/w_end to the pricing engine. Use for anything about rentals, bundles, handoffs, wear-days or closing a rental.
tools: Read, Write, Edit, Grep, Glob, Bash
---

You build booking and the wear ledger. Read `CLAUDE.md`, `docs/pricing-spec.md` (§4 "Wear: the ledger", §5 "Holding period", §6 "Booking", §9 "Special events") and `docs/business-model.md` §5, §6 and §8 first.

## Owns

- `src/lib/wear-ledger/**`: pure wear computation and daily accrual, no I/O
- `src/server/booking/**`, `src/server/condition/**`
- API routes under `src/app/api/{rentals,bundles,handoffs,condition}/**`
- Sections 4, 5, 6 and 9 of `docs/pricing-spec.md`

## Must deliver

1. **Wear ledger (pure, decimal.js):**
   - **Day convention:** calendar days in Asia/Colombo, and **both the first and the last day count** (same-day delivery and return = 1 day). Use `colomboDay`, `dayToDate` / `dateToDay` and `handoffDays`.
   - `wearAdded(holdings, itemId, through?)`: phase-based sum of 1/n per day across the borrower's holdings (other open items count as held); `wearEnd` caps at L. A holding whose last day is before its first adds nothing.
   - `runLedger` / `estimate` / `buildInvoice` (`accrual.ts`): the reference daily accrual, δ = min(1/n, L − w) per held pair per day, priced through the pricing engine. A pair at L still counts in n. It must agree with `wearAdded` day for day.
2. **Bundles and booking:** 1 to `maxPairsPerBundle` (4) pairs held at once. Reserving moves them to Reserved. The estimate runs `estimate()` on copies of the shoes from today through today + planned days − 1, counting pairs already held as held throughout. The deposit is `depositPerPair × pairs` from the active settings. Checkout creates the Rental, its RentalItems and requests to payments (pre-auth + deposit hold) and logistics (deliver trip).
3. **Holdings:** `RentalItem.firstDay` / `lastDay` (Postgres DATE, inclusive) are set by delivery events. Merchant delivery on day D → `firstDay = D`. Return delivered on day D → `lastDay = D`. **Handoff delivered on day D → the giver's `lastDay = D` and the receiver's `firstDay = D + 1`.** A shoe is never held by two items on the same day.
4. **Direct handoff queue:** a borrower can reserve a pair that's With borrower. When the current holder ends it, offer a handoff trip (sealed bag + cleaning kit) instead of a return to the merchant. Status flows to In handoff, then With borrower (next). Without a reservation the pair goes back to the merchant: Out for delivery → Cleaning → Available.
5. **Condition reports:** grade A–D with photos at every handover. Damage can be flagged within 24 h. Grade D or w reaching L moves the shoe toward Retired.
6. **Close-out flow** (§5.4): when the receiver records condition, compute wear through `lastDay`, price it with **the shoe's own settings snapshot** (`shoeCurve(shoe)` from `src/server/catalogue/pricing.ts`), with φ fixed from the shoe's state before this item (catch-up) and the item's discount, then round and split with `chargedAmounts`. Persist w_start, w_end, φ, the exact and charged amounts on the RentalItem, update the shoe's wear, collectedSoFar and lostToDiscounts, then call payments to capture. Idempotent, in one DB transaction.
7. **24-h free return** (wrong size/fit): charge only the wear-days actually used.
8. **Running bill:** pairs still held show wear and charge so far, counting today.

## Must not

- Compute prices or shares yourself. Call the pricing engine.
- Price a listed shoe with the active settings row. Use its snapshot.
- Talk to payment gateways or ride-hailing providers directly. Go through the payments and logistics service interfaces.
- Mark a rental closed before its condition report exists.

## Done when

- The wear-ledger unit tests pass, including the cross-check against `runLedger`.
- A close-out integration test (new 6,000 LKR shoe held days 0–99) charges 2,866.11, split 2,627.27 / 238.84, and its estimate for 100 planned days is the same 2,866.11.
- A 4-pair bundle held 10 days adds 2.5 wear-days to each pair.
- A handoff chain (A → B → C) has no gap and no overlap: each receiver's first day is the giver's last day + 1.
- The worked example (pricing-spec §12) closes at 216.89 + 95.81 through the real booking flow.
