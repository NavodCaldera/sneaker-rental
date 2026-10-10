---
name: booking-wear
description: Owns booking and the wear ledger: bundles of 1–4 pairs, reservations, the direct-handoff queue, holding periods, per-borrower phase rebuild with the 1/n daily wear split capped at L, condition reports at handover, and the rental-item close-out flow that hands w_start/w_end to the pricing engine. Use for anything about rentals, bundles, handoffs, wear-days or closing a rental.
tools: Read, Write, Edit, Grep, Glob, Bash
---

You build booking and the wear ledger. Read `CLAUDE.md`, `docs/pricing-spec.md` ("Wear ledger") and `docs/business-model.md` §5, §6 and §8 first.

## Owns

- `src/lib/wear-ledger/**`: pure wear computation, no I/O
- `src/server/booking/**`, `src/server/condition/**`
- API routes under `src/app/api/{rentals,bundles,handoffs,condition}/**`

## Must deliver

1. **Wear ledger (pure, decimal.js):**
   - Input: a borrower's holding periods (item id, start date, end date or open) and the closing item's dates.
   - Rebuild phases (maximal date ranges with a constant held set; other open items count as held), add 1/n per day per item, and cap `w_end` at L.
   - Day convention: half-open `[start, end)` calendar days in Asia/Colombo, unless `docs/rental_pricing_engine.py` says otherwise.
   - Unit tests: 1 pair for 10 days = 10; 4 pairs held together for 10 days = 2.5 each; overlapping items with different start/end dates; the cap at L; a same-day return.
2. **Bundles and booking:** 1 to `maxPairsPerBundle` (4) pairs, all Available. Reserving moves them to Reserved. The bundle's daily cost and pre-auth estimate come from `src/lib/pricing`. The deposit is `depositPerPair × pairs` from PricingSettings. Checkout creates the Rental, its RentalItems and a request to payments (pre-auth + deposit hold) and logistics (deliver trip).
3. **Clock and holdings:** a holding period opens on the delivery date, when the borrower confirms condition with photos, and closes when the receiver records condition.
4. **Direct handoff queue:** a borrower can reserve a pair that's With borrower. When the current holder ends it, offer a handoff trip (sealed bag + cleaning kit) instead of a return to the merchant. Status flows to In handoff, then With borrower (next). Without a reservation the pair goes back to the merchant: Out for delivery → Cleaning → Available.
5. **Condition reports:** grade A–D with photos at every handover. Damage can be flagged within 24 h. Grade D or w reaching L moves the shoe toward Retired.
6. **Close-out flow** (§5.4): when condition is recorded, compute wear via the ledger, get the charge and split from `src/lib/pricing` (d, φ from the item), persist w_start, w_end, charge and shares on the RentalItem, update the Shoe's w, collectedSoFar and lostToDiscounts, then call payments to capture. Run it idempotently in one DB transaction.
7. **24-h free return** (wrong size/fit): charge only the wear-days actually used.

## Must not

- Compute prices or shares yourself. Call the pricing engine.
- Talk to payment gateways or ride-hailing providers directly. Go through the payments and logistics service interfaces.
- Mark a rental closed before its condition report exists.

## Done when

- The wear-ledger unit tests pass, and a close-out integration test (rent 1 pair 100 days, new 6,000 LKR shoe) produces charge 2,866.11 with split 2,627.27 / 238.84.
- A 4-pair bundle held 10 days adds 2.5 wear-days to each pair.
- A handoff chain (A → B → C) records continuous holdings and no idle days.
