# Rent Calculation Spec

The maths and rules behind the pricing engine (`src/lib/pricing/`) and the wear ledger (`src/lib/wear-ledger/`). Business context is in [business-model.md](business-model.md) §3, §4 and §9.

**Rule in one line:** a borrower pays for the wear they put on each pair, priced on that shoe's curve at its current wear; wear is split across the pairs they hold each day.

## Source of truth

This file is authoritative. It merges the reference rent engine and its spec (Rental Pricing Formula Guide v2 and `rental_pricing_engine.py`), which were ported into this repo and then removed. Their test suite now lives in `src/lib/pricing/__tests__/acceptance.test.ts` and must keep passing. If you change a formula here, change the engine and those tests together.

**Product decisions that override the reference (2026-10-11):**
1. **Merchant first.** Rent goes to the merchant until they have received their target, (1 + μm) × V for a new pair; after that it goes to the platform (§7). The reference split every charge in the ratio μm : μp.
2. **Waiting for the driver is free.** A borrower's last day is the day they end the rental, not the day the pair reaches the next holder (§5).
3. **Lifespan 6–24 months** (183–730 wear-days). An admin can grant a merchant a longer maximum on request (§1.1).
4. **Release discount up to 10%** for the next borrower of a pair, shown from 10 days before the current holder's planned end (§8). The brief (§7) advised idle discounts of at most 5%; the product owner chose 10%.
5. **Tokens instead of card holds and deposits** (§6). Borrowers keep a token balance (1 token = 1 LKR) bought through the gateway; booking locks the pairs' merchant value plus the rent estimate.

---

## 1. Inputs

### 1.1 Platform settings (`PricingSettings`, admin-editable, append-only versions)

| Setting (DB column / engine field) | Symbol | Default | Meaning |
|---|---|---|---|
| `merchantMargin` | μm | 0.10 | Merchant margin on declared value (OPEN DECISION) |
| `platformMargin` | μp | 0.10 | Platform margin on declared value (OPEN DECISION) |
| `floor` | q | 0.30 | End-of-life price ÷ new price |
| `midpointRatio` | m ÷ L | 200 / 365 | Where in the life quality falls fastest |
| `baseSteepness` | β at L = refLife | 0.03 | Steepness of the curve |
| `refLife` | | 365 | Lifespan the curve shape was tuned for |
| `maxPairsPerBundle` | | 4 | Pairs a borrower may hold at once |
| `minLifespanDays` / `maxLifespanDays` (`minLife` / `maxLife`) | | 183 / 730 | Lifespan a merchant may declare: 6–24 months (1 month = 365/12 days, rounded up). `Merchant.maxLifespanDays` is a longer maximum an admin granted that merchant on request (`setLifespanExtension`, `/admin/merchants`). |
| `maxDiscount` | | 0.10 | Highest discount a borrower can get (the release discount's cap) |
| `releaseLeadDays` | | 10 | Days before a holder's planned last day that the pair is shown, discounted, to the next borrower |
| `releaseDiscountStep` | | 0.005 | Release discount added per day from the start of that window |
| `catchUpEnabled` (`catchUp`) | | false | Option B: spread past discounts over the remaining life (OPEN DECISION) |
| `capitalRate` | r | 0.12 | Idle-cost test only |
| `holdCost` (`holdCostPerDay`) | h | 0 | Idle-cost test only, LKR per idle day |

**Settings snapshot.** Changing pricing settings affects **new listings only**. Each shoe stores the settings version it was listed under (`Shoe.settingsId`, set when created and refreshed when published), so a shoe's curve never changes under a running rental. Price a shoe with `shoeCurve(shoe)` (`src/server/catalogue/pricing.ts`), never with the active row. Operational settings (token cover, bundle size, dispute window, free-return window, delivery fee) come from the active version.

### 1.2 Per shoe (from the merchant)

| Field | Symbol | Example |
|---|---|---|
| Declared value | V | 6,000 LKR |
| Expected lifespan | L | 365 wear-days |
| Wear already used, if listed second-hand (`initialWear`) | w₀ | 0 |

Shoe state: `wear` (w, starts at w₀), `collectedSoFar` (charged on the platform, after discounts, unrounded), `lostToDiscounts`, `merchantCollected` (merchant shares charged so far, net of refunds, 2 dp), `settingsId`. What a shoe has collected over its **whole life** is `lifetimeCollected = F(w₀) + collectedSoFar`; catch-up and the catch-up remaining value use that.

### 1.3 Per rental item (one pair inside a borrower's rental)

| Field | Meaning |
|---|---|
| borrower | Who holds it |
| shoe | Which pair |
| `firstDay` | First day held (the delivery date), inclusive |
| `lastDay` | Last day held (the day the borrower ended the rental), inclusive; null while held |
| `discount` | One-off discount d for this item, 0 to < 1 |
| `discountFunding` | `PLATFORM` (release discount, promotions) or `MERCHANT` (merchant idle discount) |
| `plannedDays` | Days the borrower planned at checkout; their planned last day (release day) = `firstDay` + `plannedDays` − 1 |
| `phi` | Catch-up factor φ, fixed at the start of the item |

---

## 2. The curve (per shoe)

Scale the base curve to the shoe's lifespan so every shoe has the same shape:

```
m     = midRatio × L                       (= 200 × L ÷ 365)
β     = betaBase × refLife ÷ L             (= 0.03 × 365 ÷ L)
G(w)  = 1 ÷ (1 + e^(β(w − m)))
H(w)  = w − ln(1 + e^(β(w − m))) ÷ β       antiderivative of G
a     = (1 − q) ÷ (G(0) − G(L))
Q(w)  = q + a × (G(w) − G(L))              quality: Q(0) = 1, Q(L) = q
IQ(w) = q·w + a × [H(w) − H(0) − G(L)·w]   area under Q from 0 to w
A     = IQ(L)                              ≈ 0.681976 × L; always computed, never the constant
R     = (1 + μm + μp) × V                  target lifetime income
K     = R ÷ A                              price per wear-day when new
```

Numerics: `ln(1 + e^x)` is computed as a stable softplus. Clamp w to [0, L] before use. All arithmetic in decimal.js at precision 40, never JS `number`.

`validateListing(V, L, limits)`: V > 0 and minLife ≤ L ≤ maxLife, or it throws. It runs when a shoe is created and published, with the limits that apply to that merchant (`listingLimits`: the settings, or the merchant's extension). `curveParams` only requires V > 0 and L > 0, so a shoe listed under an extension keeps its curve after the extension is removed.

| 6,000 LKR shoe, L = 365 | Value |
|---|---|
| A | 248.9214 |
| R | 7,200.00 LKR |
| K (new price per wear-day) | 28.9248 LKR |
| Price at end of life | 8.6774 LKR |
| Same shoe, L = 730: A | 497.8428 |

---

## 3. Prices

```
Curve price         P(w)       = K × Q(w)
Shown price         P_shown(w) = (1 − d) × φ × P(w)
Collected on curve  F(w)       = K × IQ(w)
Charge w0 → w1      (1 − d) × φ × K × [IQ(w1) − IQ(w0)]
```

- The listing page shows `P_shown` at the shoe's current wear (φ from the shoe's settings), plus wear used and % of life left.
- **The next renter always starts from the curve price `P(w_end)`**, never from the previous renter's discounted price. Discounts never stack.

---

## 4. Wear: the ledger

A **wear-day** is one calendar day a pair is held. Days are calendar dates in Asia/Colombo, and **both the first day (delivery) and the last day (the day the borrower ends the rental) count**.

For each borrower and each day t:

```
n(t)   = number of pairs that borrower holds on day t        (1 to maxPairs)
δ(t)   = min(1 ÷ n(t), L − wear so far)                      wear each held pair gains
charge = (1 − d) × φ × K × [IQ(w + δ) − IQ(w)]               for that pair, that day
```

- A pair at end of life (wear = L) gains nothing and is charged nothing, but **still counts in n** while held. The unused share is reported as `uncharged`.
- Holding a pair without wearing it still adds wear-days. That is by design (§6).
- Different borrowers never affect each other: n is per borrower, across all their rentals.
- A shoe is in only one item on any day (no overlapping items for the same shoe).
- Same-day delivery and return counts as 1 day held. If one item's last day is another of the same borrower's items' first day, both count that day (n includes both).

Accruing day by day gives exactly the same total as one formula per item, because every charge is a difference of IQ and the in-between values cancel. The tests check this.

**Implementation.**
- `runLedger(items, shoes, fromDay, toDay, { maxPairs })` (`src/lib/wear-ledger/accrual.ts`) is the reference daily accrual. It runs booking estimates and the acceptance scenarios.
- The app closes an item with the phase-based `wearAdded(holdings, itemId)`, which sums 1/n over the borrower's phases (maximal day ranges with a constant set of held items). Then `w_end = min(w_start + wearAdded, L)` and the pricing engine charges `w_start → w_end`. A unit test checks `wearAdded` against `runLedger` day for day.
- The reference also recommends a nightly accrual job writing one `wear_ledger` row per held item per day, for a running bill and an audit trail. **Not built yet.** The running bill on `/rentals` is computed on demand instead, and gives the same totals.

---

## 5. Holding period and delivery events

The holding period runs from delivery to the borrower until the day the borrower **ends the rental**. Days the pair then waits at the borrower's home for the driver, travels, or waits for the merchant's inspection are charged to nobody and add no wear (product decision 2). The risk that a borrower keeps wearing the pair after ending is handled by the condition check at the next handover.

| Event | Ledger days |
|---|---|
| Merchant → borrower delivered on day D | receiver `firstDay = D` |
| Borrower ends the rental on day E (`endRental`) | `lastDay = E` |
| Return delivered to the merchant | `endDate` (timestamp) recorded; `lastDay` unchanged |
| Direct handoff delivered on day D | giver's `endDate` recorded; receiver `firstDay = max(D, giver's lastDay + 1)` (`receiverFirstDay`) |
| Lost pair | `lastDay` = the day it is marked lost, if not already set |

A shoe is never held by two items on the same day. The item **closes** (wear, charge and split are computed) when the receiver records condition. Items on one shoe close in order, so `w_start` (the shoe's wear at close) equals the previous holder's `w_end`.

---

## 6. Booking: estimate and tokens

1. The borrower picks pairs and planned days. Reject more than `maxPairsPerBundle` held at once (counting pairs already held or awaiting delivery).
2. The estimate runs the ledger on copies of the shoes (`estimate()`), from today through today + planned days − 1, with the pairs the borrower already holds counted as held throughout. It doesn't change shoe state. When the plan is kept, estimate = final charge.
3. Lock **the pairs' merchant value + the estimate** from the borrower's tokens (`lockForRental`, in the booking transaction). Example: 2 pairs worth 12,000 with a 600 estimate need 12,600 tokens available. Short balance → no booking; the bundle page shows how much to top up.

**Tokens** (`src/server/wallet`, append-only `WalletEntry` ledger, 1 token = 1 LKR):
- Top up = a card sale through the gateway; withdraw = refunds of those sales, newest first, up to the available (unlocked) balance.
- balance = top-ups + credits − charges − withdrawals; locked = locks − unlocks; available = balance − locked. The balance can go negative (a lost pair worth more than was locked): the borrower can't book again until it is cleared.
- At each return, the pair's rent is charged from the rental's locked tokens and its merchant value is unlocked (kept locked while a dispute on it is open). When the rental closes, whatever is left is unlocked.
- **Overrun check** (daily, `checkWalletCover`, `/api/cron/wallet`): a rental needs Σ value of pairs still out + rent so far + the next `topUpLeadDays` (3) days' rent locked. If short, more free tokens are locked automatically; if that isn't enough, the borrower is asked to top up within `topUpGraceDays` (3); after that the pairs are recalled (their rentals ended, so charging stops and a driver collects them).
- OPEN DECISION (legal): holding customer money as a stored balance may need Central Bank of Sri Lanka approval; check before launch.
4. Each item's discount is fixed at booking, and with catch-up on, φ is fixed at the start of the item from the shoe's state before that rental. Neither changes during the rental.

---

## 7. Closing an item and invoicing

1. Wear from the ledger through the item's `lastDay`; gross (before discount) and amount (after discount) from the pricing engine.
2. Round and split **merchant first** with `chargedAmounts(amount, { merchantOutstanding, undiscounted: gross })`:

```
merchantTarget      = (1 + μm) × V × (1 − IQ(w₀) ÷ A) − merchant-funded discounts so far
                      (= (1 + μm) × V for a new pair; a second-hand pair's share of what is still collectable)
merchantOutstanding = max(0, merchantTarget − merchantCollected)
```

| Field | Rule |
|---|---|
| `charge` | `round(amount)`, the only rounding of the charge |
| `merchantShare` | `min(charge, round(merchantOutstanding))` |
| `platformShare` | `charge − merchantShare`, so cents always add up |
| `discountGiven` | `round(gross) − charge` |

The platform earns nothing on a shoe until its merchant has been paid in full; once the target is met, the platform gets everything. Over a full life of a new 6,000 LKR shoe the merchant still gets 6,600 and the platform 600 (the brief's 110 : 10 ratio holds for the lifetime, not per rental). If a shoe's lifetime rent falls short of the target (discounts without catch-up, early retirement), the merchant gets all of it and the platform nothing. `merchantCollected` is updated at close; helpers: `merchantOwed(shoe)`, `merchantFundedDiscounts(tx, shoeId)` in `src/server/catalogue/pricing.ts`.

3. Charge the final total (not the estimate) from the rental's locked tokens and unlock the pair's value; keep it locked while a dispute is open.
4. The merchant share is paid after the dispute window (3 days), in the weekly payout.

**Rounding:** keep all wear and money unrounded. Round to 2 decimals, half away from zero, only for what is shown or charged. Charged amounts are stored as `Decimal(14, 2)`; unrounded values as `Decimal(28, 12)`.

---

## 8. Discounts and catch-up

```
Discount cost   = d × gross
Option A (default, catchUp = false):  φ = 1. Lifetime = R − Σ discount costs.
Option B (catchUp = true):            φ = (R − lifetimeCollected) ÷ (K × [A − IQ(w)])  at the item's start, never below 0
```

- **Merchant idle discounts** (`discountFunding = MERCHANT`, not offered yet) are capped at `maxDiscount` and lower the merchant's target by their cost, so the merchant bears them.

### Release discount (built)

When a borrower plans a rental, the pair is offered to the next borrower before it comes free, at a discount that grows the closer it gets to release and the longer it then waits:

```
releaseDay   = holder's firstDay + plannedDays − 1          (Shoe.releaseDay, set on delivery)
windowStart  = releaseDay − releaseLeadDays + 1             (releaseWindowStart)
discount(t)  = min(maxDiscount, releaseDiscountStep × (t − windowStart + 1))   for t ≥ windowStart, else 0
```

For a 90-day plan (days 1–90): hidden from Browse until day 81, then 0.5% off on day 81, 1% on day 82, … 5% on day 90 (release), 10% on day 100 if no one has taken it, and a steady 10% after that, until the pair is rented again (`releaseDiscount`).

- A held pair appears in Browse ("Reserve next") only once its window opens; before that it can't be reserved. A pair that is back with the merchant stays listed and keeps counting from the same release day. A pair never rented has no discount.
- The next borrower **locks in the rate of the day they book**, for their whole rental (`RentalItem.discount`, fixed at checkout). Their own planned days set the pair's next release day.
- It applies to the next borrower only, never to the current holder.
- It uses the active settings (a platform marketing rule), not the shoe's settings snapshot.
- OPEN DECISION: it is funded by the platform (`PLATFORM`), so the merchant is still paid first. If release discounts on a pair add up to more than the platform's margin, the merchant falls short of their target.
- **Platform promotions** (`PLATFORM`, the default) leave the merchant's target alone, so the platform bears them: it reaches its own share later, or not at all.

---

## 9. Special events

| Event | Calculation |
|---|---|
| Early return | `lastDay` = the day the borrower ends it. Charge only what the ledger accrued. |
| Extension | Rentals are open-ended until the borrower ends them. The daily overrun check asks for a top-up before the locked tokens run out and recalls the pairs if it doesn't come (§6). |
| Direct handoff | The giver's last day is the day they ended the rental; the receiver starts on the delivery day (the next day if the giver ended that same day). Waiting days in between are free. |
| Shoe reaches L | No more wear or charge; the item stays open until returned and still counts in n. |
| Lost shoe | Charge `remainingValue(p, w, lifetimeCollected, settings)`: K × (A − IQ(w)), or R − lifetimeCollected with catch-up. Split merchant first (a new pair: 7,200 → merchant 6,600, platform 600); taken from the rental's locked tokens, then the free balance (which may go negative). |
| Refund (upheld dispute) | Up to the item's charge. Up to that item's merchant share comes off the merchant's payout and `merchantCollected`, so later rentals pay the merchant back first; the rest is the platform's cost. |
| Buy it now (Phase 2) | Price = `remainingValue`, same as a lost shoe. Close the item first, then sell. |
| Damage | Assessed through a dispute; an upheld claim charges up to the pair's merchant value from the borrower's tokens. Not part of the rent. |
| Wrong size within 24 h | Close the item at return; charge only the wear-days used. The return trip is on the platform. |

---

## 10. Idle-cost test (Phase 2 discount ladder)

```
c                    = V × r ÷ 365 + h          idle cost per day       (idleCostPerDay)
break-even idle days = d × gross ÷ c                                      (breakEvenIdleDays)
```

Offer a discount only if it is expected to save at least that many idle days. Example: 6,000 LKR shoe, r = 0.12, a 30-wear-day rental from new → c = 1.9726 a day, and a 5% discount needs about 22 idle days saved, and a 10% discount about 44 (the brief's figure, §7).

---

## 11. Acceptance tests

All in `src/lib/pricing/__tests__/acceptance.test.ts`. Tolerance 1e-4 on 4-dp values unless stated; exact equality on 2-dp charged amounts.

| Test | Expected |
|---|---|
| 6,000 LKR shoe, L = 365 | A 248.9214, K 28.9248, end price 8.6774 |
| Same shoe, L = 730 | A 497.8428, new price halves, floor still 30% |
| 90-day test problem, shoes A–E | Total 3,030.2730; A 554.0527, B 434.6162, C 865.6896, D 36.2029, E 1,139.7117; D uncharged 2.5 wear-days |
| Hard test problem, 10 borrowers, 4 shoes, 800 days | All 24 items match (1e-5); total 33,600.00; every shoe collects exactly R |
| User 1 wear 0 → 100 at 10% off | 2,579.5029; discount cost 286.6114 |
| Next renter at wear 100 | Starts at 28.0059 (Option A) or 29.8580 with φ = 1.066133 (Option B) |
| Three renters, 10% each, full life | Lifetime 6,480.00 |
| 100-wear-day rental from new | 2,866.11 |
| Lifetime ratio of 2,866.11 (brief §9) | 2,627.27 / 238.84 (`splitCharge`; previews only) |
| Merchant first | 2,866.11 against 6,600 owed → all to the merchant; the rental that crosses the target splits at the target; hard test: each merchant gets exactly 1.1 V, the platform 2,800 in all |
| 4 pairs held one day | Each gains 0.25 wear-day; total ≈ one new pair-day |
| Merchant-funded 5% idle discount | Same charge as a promotion; lowers the merchant's lifetime total by its cost (a promotion lowers the platform's) |
| Release discount, 90-day plan | Day 80: 0; day 81: 0.5%; day 82: 1%; day 90: 5%; day 91: 5.5%; day 100: 10%; later: 10%; never rented: 0; the whole next rental at the booked rate |
| Worked example (section 12) | A 216.89, B 95.81, total 312.70; all to the merchants (neither target reached) |
| Estimate vs final | Equal when the plan is kept; estimate leaves shoe state unchanged |
| Remaining value at wear 100 / idle cost | 7,200 − 2,866.1143; 1.9726 a day; 5% on 30 days ≈ 22 idle days |
| Guards | Double booking, more than 4 pairs, lifespan outside 183–730 at listing (unless extended), value ≤ 0, discount outside [0, 1) all throw |

### Scenario inputs

**90-day test problem.** One borrower; all shoes L = 365. Days are inclusive.

| Shoe | V | w₀ | Held |
|---|---|---|---|
| A | 6,000 | 0 | days 1–60 |
| B | 7,500 | 40 | days 1–35 |
| C | 9,000 | 120.5 | days 11–75 |
| D | 5,000 | 360 | days 21–50 (reaches L) |
| E | 8,000 | 0 | days 36–90 |

**Hard test problem.** Four new shoes, L = 365: S1 6,000, S2 7,500, S3 9,000, S4 5,500. Items (borrower, shoe, first day, last day):

```
U1 S1 1–90     U1 S2 1–45     U2 S3 5–120    U2 S4 5–60     U2 S2 50–100
U3 S4 70–200   U3 S1 95–160   U4 S2 110–230  U5 S3 130–300  U5 S1 170–260
U5 S4 210–280  U6 S2 240–400  U6 S1 270–330  U7 S4 290–420  U7 S3 310–380
U8 S1 340–520  U8 S3 390–500  U8 S2 410–470  U9 S4 430–575  U9 S2 480–560
U10 S3 510–800 U10 S1 530–780 U10 S4 610–720 U10 S2 650–760
```

Every shoe reaches L and collects exactly R; the total is 33,600.00 (= 1.2 × 28,000).

---

## 12. Worked example (one borrower, two pairs)

Shoes: A (6,000 LKR, new) and B (8,000 LKR, wear 50), both L = 365. The borrower holds A on days 1–10 and B on days 6–10, no discounts.

| Days | Pairs held | n | A gains | B gains |
|---|---|---|---|---|
| 1–5 | A | 1 | 5 × 1 = 5.0 | — |
| 6–10 | A, B | 2 | 5 × 0.5 = 2.5 | 5 × 0.5 = 2.5 |

| Item | Wear | Price per wear-day, start → end | Charged | Merchant | Platform |
|---|---|---|---|---|---|
| A (6,000 LKR) | 0 → 7.5 | 28.92 → 28.91 | 216.89 | 216.89 | 0.00 |
| B (8,000 LKR) | 50 → 52.5 | 38.33 → 38.31 | 95.81 | 95.81 | 0.00 |
| **Invoice** | | | **312.70** | **312.70** | **0.00** |

Merchant first: A's merchant is owed 6,600 and B's 8,800 × (1 − IQ(50) ÷ A), so both rentals go entirely to the merchants. (The reference split them 286.65 / 26.05.)

A = K_A × [IQ(7.5) − IQ(0)] and B = K_B × [IQ(52.5) − IQ(50)]. Application code never computes charges by hand; it calls the engine.

---

## 13. Where it lives

- `src/lib/pricing/`: `curveParams`, `validateListing`, `Q`, `IQ`, `priceAt`, `shownPrice`, `curveIncome`, `curvePoints`, `targetIncome`, `incomeBetween`, `catchUpPhi`, `lifetimeCollected`, `remainingValue`, `splitCharge` (proportional, for previews), `releaseWindowStart`, `releaseDiscount`, `merchantTarget`, `merchantOutstanding`, `chargedAmounts` (merchant first), `bundleDailyCost`, `idleCostPerDay`, `breakEvenIdleDays`.
- `src/lib/wear-ledger/`: `wearAdded`, `wearEnd`, `colomboDay`, `dayToDate` / `dateToDay` / `dayNumber`, `receiverFirstDay`, `plannedLastDay`, `lifeLeft`; `runLedger`, `estimate`, `buildInvoice` (accrual.ts; carries each shoe's merchant balance across its items).
- `src/server/catalogue/pricing.ts`: `shoeCurve`, `nextPhi`, `shoePricing`, `releaseInfo`, `merchantOwed`, `merchantFundedDiscounts` (a shoe priced with its own settings snapshot). `src/server/catalogue/index.ts`: `listingLimits`, `setLifespanExtension`, `monthsToDays` / `daysToMonths`.
- End of a holding: `endRental`; close-out: `closeItem`, both in `src/server/booking/lifecycle.ts`. Estimate: `quoteBundle` in `src/server/booking/checkout.ts`. Lost pair: `markLost` in `src/server/payments/index.ts`.
