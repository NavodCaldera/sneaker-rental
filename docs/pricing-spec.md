# Rent Calculation Spec

The maths and rules behind the pricing engine (`src/lib/pricing/`) and the wear ledger (`src/lib/wear-ledger/`). Business context is in [business-model.md](business-model.md) §3, §4 and §9.

**Rule in one line:** a borrower pays for the wear they put on each pair, priced on that shoe's curve at its current wear; wear is split across the pairs they hold each day.

## Source of truth

This file is authoritative. It merges the reference rent engine and its spec (Rental Pricing Formula Guide v2 and `rental_pricing_engine.py`), which were ported into this repo and then removed. Their test suite now lives in `src/lib/pricing/__tests__/acceptance.test.ts` and must keep passing. If you change a formula here, change the engine and those tests together.

**Product decisions that override the reference (2026-10-11):**
1. **Merchant first.** Rent goes to the merchant until they have received their target, (1 + μm) × V for a new pair; after that it goes to the platform (§7). The reference split every charge in the ratio μm : μp.
2. **Waiting for the driver is free.** A borrower's last day is the day they end the rental (or their term's last day), not the day the pair reaches the next holder (§5).
3. **Lifespan 6–24 months** (183–730 wear-days). An admin can grant a merchant a longer maximum on request (§1.1).
4. **Release discount up to 10%** for the next borrower of a pair, starting 10 days before the current holder's term ends (§8); the pair itself can be reserved from the holder's day 1 (decision 10). The brief (§7) advised idle discounts of at most 5%; the product owner chose 10%.
5. **Tokens instead of card holds** (§6). Borrowers keep a token balance (1 token = 1 LKR) bought through the gateway. Each pair's merchant value is locked as its own deposit, at full value, for as long as the pair is out, and its rent estimate is locked beside it; only tokens above the locks can be withdrawn as money.
6. **Fixed-term rentals, post-paid rent (locked at booking, charged at return)** (§6, §6a, §7). The borrower books a term (e.g. 90 days). Nothing is charged at booking: the pair's deposit (V) and the rent estimate for the term are locked, and both stay locked until the pair's item closes. Then the rent lock is released and the actual rent, from the wear the pair really got, is charged; only then does the merchant's share become payable. The pair's wear is committed at once: a new pair booked for 90 days shows 90/365 used, and is free again after the term. Day 1 is the day after delivery (the delivery day is free). Extending locks the extra estimate; on the day after the term ends a driver collects the pair, and waiting for the driver is free. (Decided 2026-10-11; replaces rent paid upfront.)
7. **Early return needs 10 days' notice** (§6a). The borrower picks a new last day at least `earlyReturnNoticeDays` (10) ahead; the term is shortened to it and the rent lock for the unused days is released at once. Only a wrong-size return within `freeReturnHours` of delivery can end at once.
8. **Booking up to the lifespan, charging past it** (§3, §6). A pair with any life left (`committedWear` < L) can be booked for any term. Past L, wear keeps counting and every further wear-day is charged at the end-of-life price P(L) = K · q until the pair is returned, even if the pair then collects more than its target R (`chargePastLife`, on). Once a pair's committed wear reaches L nobody can book it. The reference engine stopped wear and rent at L; its acceptance scenarios still run with `chargePastLife` off.
9. **Trips are not handled by us.** Whoever receives the pair pays the driver directly in the ride-hailing app: the borrower for deliveries, the next borrower for handoffs, the merchant for returns. No trip fee or booking fee ever goes through tokens.
10. **Anytime forward booking** (§6a). A pair someone holds can be reserved from the holder's day 1, for a term starting right after the holder's term (direct handoff), priced at the wear the pair will have at the holder's `termEndDay`. If the holder gives notice of an early return, the reserved borrower is offered the earlier start date at the new price (less wear costs more per day), in the app and by email, with `offerResponseHours` (24) to accept. Accept: their plan and rent lock move to the new dates and the pair is handed over after the holder's new last day. Decline, want to keep the original dates, or no answer in time: the reservation is **cancelled**, all its tokens (deposit and rent estimate) unlocked, and the borrower told in the app and by email; the pair stays with the holder, free (no rent, no wear), once their term ends, and is not collected: it waits with them until a new borrower books it, then goes straight to that borrower by direct handoff (`holdForNext`). (Decided 2026-10-11; replaces the 10-day reservation window.)
11. **The merchant picks the pricing method** (§2). Each listing is priced on either the **S-curve (logistic decay)**, the default and the curve every earlier listing has, or **exponential decay**. Both start at the new price K, end at the same floor q (30% of new) at L, aim for the same target R and charge P(L) = K · q per wear-day past L; only how the price falls in between differs. The merchant chooses on the listing form (with a live preview of each) and can change it while the pair is a draft. A "?" next to "Pricing method" explains the choice: the price should fall the way the pair's quality does, so pick the S-curve for a pair that stays like new for a good while and then wears faster in mid-life, and exponential decay for one that loses its fresh look early and then wears slowly (decided 2026-10-12). Once published the method is fixed (`Shoe.pricingMethod`), like the settings snapshot, so rent estimates, reservations and the merchant's target never move under a rental. (Decided 2026-10-11.)

---

## 1. Inputs

### 1.1 Platform settings (`PricingSettings`, admin-editable, append-only versions)

| Setting (DB column / engine field) | Symbol | Default | Meaning |
|---|---|---|---|
| `merchantMargin` | μm | 0.10 | Merchant margin on declared value (OPEN DECISION) |
| `platformMargin` | μp | 0.10 | Platform margin on declared value (OPEN DECISION) |
| `floor` | q | 0.30 | End-of-life price ÷ new price, for both pricing methods. Must be above 0 and below 1 (exponential decay q^(w/L) needs it) |
| `midpointRatio` | m ÷ L | 200 / 365 | Where in the life quality falls fastest |
| `baseSteepness` | β at L = refLife | 0.03 | Steepness of the curve |
| `refLife` | | 365 | Lifespan the curve shape was tuned for |
| `maxPairsPerBundle` | | 4 | Pairs a borrower may hold at once |
| `minLifespanDays` / `maxLifespanDays` (`minLife` / `maxLife`) | | 183 / 730 | Lifespan a merchant may declare: 6–24 months (1 month = 365/12 days, rounded up). `Merchant.maxLifespanDays` is a longer maximum an admin granted that merchant on request (`setLifespanExtension`, `/admin/merchants`). |
| `maxDiscount` | | 0.10 | Highest discount a borrower can get (the release discount's cap) |
| `releaseLeadDays` | | 10 | Days before a holder's planned last day that the pair is shown, discounted, to the next borrower |
| `releaseDiscountStep` | | 0.005 | Release discount added per day from the start of that window |
| `offerResponseHours` | | 24 | Time a reserved-next borrower has to accept a higher price after an early return, before the reservation is cancelled (OPEN DECISION) |
| `earlyReturnNoticeDays` | | 10 | An early return is asked for at least this many days before the new last day |
| `catchUpEnabled` (`catchUp`) | | false | Option B: spread past discounts over the remaining life (OPEN DECISION) |
| `chargePastLife` | | true | Past L, keep counting wear and charge P(L) per wear-day until the pair is returned, even past R. Off = the reference engine (wear and rent stop at L). Part of each shoe's settings snapshot |
| `capitalRate` | r | 0.12 | Idle-cost test only |
| `holdCost` (`holdCostPerDay`) | h | 0 | Idle-cost test only, LKR per idle day |

**Settings snapshot.** Changing pricing settings affects **new listings only**. Each shoe stores the settings version it was listed under (`Shoe.settingsId`, set when created and refreshed when published), so a shoe's curve never changes under a running rental. Price a shoe with `shoeCurve(shoe)` (`src/server/catalogue/pricing.ts`), never with the active row. Operational settings (bundle size, dispute window, free-return window, offer response time, early-return notice) come from the active version.

### 1.2 Per shoe (from the merchant)

| Field | Symbol | Example |
|---|---|---|
| Declared value | V | 6,000 LKR |
| Expected lifespan | L | 365 wear-days |
| Wear already used, if listed second-hand (`initialWear`) | w₀ | 0 |
| Pricing method (`pricingMethod`: `LOGISTIC` = S-curve, the default, or `EXPONENTIAL`; §2) | — | `LOGISTIC` |
| Condition the merchant declares (`condition`: `NEW`, `SECOND_HAND`, `SECOND_HAND_UPGRADED`, plus `upgradeNotes`) | — | `NEW` |

The condition is information for borrowers and never enters the price: a brand-new pair must have w₀ = 0, a second-hand pair (upgraded or not) must have w₀ > 0, and an upgraded pair must say what was upgraded. Two pairs with the same V, L and w₀ cost the same whatever their condition.

Shoe state: `wear` (w, starts at w₀; settled wear, updated when an item closes), `committedWear` (settled wear plus the planned wear of every open booking on the pair, §6a; what listings show and what the next borrower is priced at), `collectedSoFar` (charged on the platform, after discounts, unrounded), `lostToDiscounts`, `merchantCollected` (merchant shares charged so far, net of refunds, 2 dp), `settingsId`. What a shoe has collected over its **whole life** is `lifetimeCollected = F(w₀) + collectedSoFar`; catch-up and the catch-up remaining value use that.

### 1.3 Per rental item (one pair inside a borrower's rental)

| Field | Meaning |
|---|---|
| borrower | Who holds it |
| shoe | Which pair |
| `firstDay` | Day 1 of the term: the day after delivery, inclusive |
| `lastDay` | Last day held (the day the borrower ended the rental, or `termEndDay`), inclusive; null while held |
| `plannedDays` | The term the borrower booked (plus any extensions) |
| `termEndDay` | The term's last day = `firstDay` + `plannedDays` − 1, set on delivery; also the pair's release day |
| `discount` | One-off discount d for this item, 0 to < 1 |
| `discountFunding` | `PLATFORM` (release discount, promotions) or `MERCHANT` (merchant idle discount) |
| `phi` | Catch-up factor φ, fixed at the start of the item |
| `plannedFirstDay` | The planned day 1; for a reservation, the start the borrower agreed to (§6a) |
| `plannedWearStart` / `plannedWearEnd` | The pair's wear before and after this item's planned term (§6a) |
| `plannedCharge` | Rent estimate for the planned term, rounded; what the borrower has agreed to |
| `rentLocked` | Tokens locked for the rent estimate: `plannedCharge` less anything already charged |
| `rentPaid` | Rent tokens charged for this item, net of refunds: 0 until it closes, then its charge |
| `offerFirstDay` / `offerCharge` / `offerWearStart` / `offerDueAt` | New dates and price waiting for a reserved-next borrower to accept (§6a) |
| `earlyReturnAt` | When the borrower gave notice of an early return (`termEndDay` is then the new last day) |
| `holdForNext` | A reservation on this pair was declined (or not answered) after an early return: when this holding ends the pair stays with the borrower, free, until a new borrower books it, instead of going back to the merchant |

---

## 2. The curve (per shoe)

Every curve is a quality Q(w) with Q(0) = 1 and Q(L) = q, scaled to the shoe's lifespan. The merchant picks its shape per listing (`Shoe.pricingMethod`, decision 11); `curveParams(V, L, settings, method)` defaults to the S-curve. Whatever the shape:

```
IQ(w) = ∫₀ʷ Q                              area under Q from 0 to w
A     = IQ(L)                              always computed, never a constant
R     = (1 + μm + μp) × V                  target lifetime income
K     = R ÷ A                              price per wear-day when new
P(L)  = K × q                              end-of-life price, also charged past L
```

so both methods collect R over the life (plus P(L) a wear-day past L), and everything after this section (charges, merchant first, catch-up, remaining value, release discount) works on either curve unchanged.

### 2.1 S-curve: logistic decay (`LOGISTIC`, the default)

Scale the base curve to the shoe's lifespan so every shoe has the same shape:

```
m     = midRatio × L                       (= 200 × L ÷ 365)
β     = betaBase × refLife ÷ L             (= 0.03 × 365 ÷ L)
G(w)  = 1 ÷ (1 + e^(β(w − m)))
H(w)  = w − ln(1 + e^(β(w − m))) ÷ β       antiderivative of G
a     = (1 − q) ÷ (G(0) − G(L))
Q(w)  = q + a × (G(w) − G(L))              quality: Q(0) = 1, Q(L) = q
IQ(w) = q·w + a × [H(w) − H(0) − G(L)·w]   area under Q from 0 to w
A     = IQ(L)                              ≈ 0.681976 × L
```

The price stays close to K while the pair is fresh, falls fastest around the midpoint m (55% of L), then levels off towards the floor.

### 2.2 Exponential decay (`EXPONENTIAL`)

```
λ     = ln(1 ÷ q) ÷ L                      (= 1.2039728 ÷ L for q = 0.30)
Q(w)  = e^(−λw) = q^(w ÷ L)                quality: Q(0) = 1, Q(L) = q exactly
IQ(w) = (1 − e^(−λw)) ÷ λ
A     = (1 − q) ÷ λ = (1 − q) × L ÷ ln(1 ÷ q)   ≈ 0.581408 × L
```

The price is highest when the pair is brand new and falls fastest straight away, then more gently: compared with the S-curve, a brand-new pair costs more, a part-worn pair less (the curves cross at about 14% of L and again at about 58%), and a well-worn pair more. The S-curve collects about 69% of R in the first half of the life, exponential decay about 65%. The midpoint and steepness settings don't apply. It needs 0 < q < 1 (`curveParams` throws otherwise; the settings form enforces it). At w = L the engine returns q exactly, so P(L) = K × q to the last digit, as on the S-curve.

Numerics: `ln(1 + e^x)` is computed as a stable softplus. Clamp w to [0, L] before use. All arithmetic in decimal.js at precision 40, never JS `number`.

`validateListing(V, L, limits)`: V > 0 and minLife ≤ L ≤ maxLife, or it throws. It runs when a shoe is created and published, with the limits that apply to that merchant (`listingLimits`: the settings, or the merchant's extension). `curveParams` only requires V > 0 and L > 0, so a shoe listed under an extension keeps its curve after the extension is removed.

| 6,000 LKR shoe, L = 365 | S-curve | Exponential decay |
|---|---|---|
| A | 248.9214 | 212.2141 |
| R | 7,200.00 LKR | 7,200.00 LKR |
| K (new price per wear-day) | 28.9248 LKR | 33.9280 LKR |
| Price at a quarter of life (w = 91.25) | 28.2214 LKR | 25.1095 LKR |
| Price at half of life (w = 182.5) | 21.3775 LKR | 18.5831 LKR |
| Price at three quarters (w = 273.75) | 10.5499 LKR | 13.7531 LKR |
| Price at end of life, and per wear-day past it | 8.6774 LKR | 10.1784 LKR |
| Same shoe, L = 730: A | 497.8428 | 424.4282 |

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
- **Past the lifespan** (`chargePastLife`): P(w) = P(L) = K · q for every w > L, so rent is charged on `rentIntegral(w) = IQ(w) + q · max(0, w − L)`:

```
Charge w0 → w1   (1 − d) × φ × K × [rentIntegral(w1) − rentIntegral(w0)]
                 = the curve up to L, plus (1 − d) × φ × P(L) per wear-day past L
```

  A 6,000 LKR / 365-day pair costs 8.68 LKR per wear-day past L. Its lifetime income then exceeds R; merchant first (§7) means the merchant still gets exactly their target and everything above it goes to the platform. Lost-pair and buy-out values (`remainingValue`) stay 0 past L.

---

## 4. Wear: the ledger

A **wear-day** is one calendar day a pair is held. Days are calendar dates in Asia/Colombo, and **both the first day (the day after delivery) and the last day (the day the borrower ends the rental, or the term's last day) count**.

For each borrower and each day t:

```
n(t)   = number of pairs that borrower holds on day t        (1 to maxPairs)
δ(t)   = min(1 ÷ n(t), L − wear so far)                      wear each held pair gains
charge = (1 − d) × φ × K × [IQ(w + δ) − IQ(w)]               for that pair, that day
```

- A pair past its lifespan (wear ≥ L) keeps gaining its 1/n share each day and is charged P(L) per wear-day (`chargePastLife`). It **counts in n** like any held pair. In the reference engine (`chargePastLife` off) it gains nothing and is charged nothing, still counts in n, and the unused share is reported as `uncharged`. `wearEnd` and `chainWear` cap at L only when `chargePastLife` is off.
- Holding a pair without wearing it still adds wear-days. That is by design (§6).
- Different borrowers never affect each other: n is per borrower, across all their rentals.
- A shoe is in only one item on any day (no overlapping items for the same shoe).
- Same-day delivery and return counts as 1 day held. If one item's last day is another of the same borrower's items' first day, both count that day (n includes both).

Accruing day by day gives exactly the same total as one formula per item, because every charge is a difference of IQ and the in-between values cancel. The tests check this.

**Implementation.**
- `runLedger(items, shoes, fromDay, toDay, { maxPairs })` (`src/lib/wear-ledger/accrual.ts`) is the reference daily accrual. It runs booking estimates and the acceptance scenarios.
- The app closes an item with the phase-based `wearAdded(holdings, itemId)`, which sums 1/n over the borrower's phases (maximal day ranges with a constant set of held items). Then `w_end = min(w_start + wearAdded, L)` and the pricing engine charges `w_start → w_end`. A unit test checks `wearAdded` against `runLedger` day for day.
- The reference also recommends a nightly accrual job writing one `wear_ledger` row per held item per day. It is not needed: the rent estimate for the whole term is locked at booking, wear is committed upfront (§6a), and the actual rent is charged once at close (§7), so nothing accrues day by day. The daily job only ends terms and expires price offers (§6a).
- `chainWear(settledWear, added[], L)` chains the open items on one pair: each starts at the previous one's planned end (capped at L only when `chargePastLife` is off).

---

## 5. Holding period and delivery events

The holding period runs from the day after delivery to the term's last day. The delivery day, and days the pair then waits at the borrower's home for the driver, travels, or waits for the merchant's inspection, are charged to nobody and add no wear (product decisions 2 and 6). The risk that a borrower keeps wearing the pair after ending is handled by the condition check at the next handover.

| Event | Ledger days |
|---|---|
| Merchant → borrower delivered on day D | receiver `firstDay = D + 1`, `termEndDay = firstDay + plannedDays − 1` (`firstDayAfterDelivery`) |
| Notice of an early return on day N for last day E (`scheduleEarlyReturn`) | Allowed for N + `earlyReturnNoticeDays` ≤ E < `termEndDay` (and E ≥ `firstDay`). `termEndDay = E`, `plannedDays = E − firstDay + 1`; the borrower keeps the pair until then |
| The term runs out (daily job, on `termEndDay + 1`) | `lastDay = termEndDay`; a driver collects the pair (or hands it to the next borrower) |
| Borrower presses End rental on the term's last day, or within `freeReturnHours` of delivery (wrong size) | `lastDay = min(today, termEndDay)`. Any other day is refused with the earliest last day they can pick |
| Return delivered to the merchant | `endDate` (timestamp) recorded; `lastDay` unchanged |
| Direct handoff delivered on day D | giver's `endDate` recorded; receiver `firstDay = max(D, giver's lastDay) + 1` (`receiverFirstDay`) |
| Lost pair | `lastDay` = the day it is marked lost, if not already set |

A shoe is never held by two items on the same day. The item **closes** (wear, charge and split are computed) when the receiver records condition. Items on one shoe close in order, so `w_start` (the shoe's wear at close) equals the previous holder's `w_end`.

---

## 6. Booking: fixed term, post-paid rent, deposits and tokens

1. The borrower picks pairs and a term (`plannedDays`, 1–365). Reject more than `maxPairsPerBundle` held at once (counting pairs already held, awaiting delivery or reserved next).
2. **Lifespan:** a pair can be booked while its `committedWear` < L, for any term. A 365-day pair with 364 wear-days used can be booked for 20 days: it pays 1 wear-day on the curve and 19 wear-days at P(L) (8.68 LKR for a 6,000 LKR pair), and its committed wear becomes 384. Nobody can book or reserve it again; it is retired when it comes back (§9).
3. The quote plans the term (§6a) on copies of the pairs: each new pair from its expected first day for `plannedDays`, counting the borrower's other bookings over their own planned terms. A free pair's expected first day is tomorrow (delivered today at the earliest); a held pair's is the day after the current holder's term ends, plus a day for the handoff. Each pair starts from its `committedWear`, so a held pair is priced at the wear it will have at the end of its holder's term. A held pair can be reserved from its holder's day 1 (§6a), unless someone has already reserved it.
4. In the booking transaction: lock **each pair's merchant value** as its own deposit (`lockDeposit`, a `LOCK` with purpose `DEPOSIT` per item) and lock **the rent estimate** for its term (`lockRent`, purpose `RENT`, `rentLocked`). Nothing is charged. Plan again, so the borrower's other bookings follow the new overlap (§6a). If the borrower's available tokens would go below zero, nothing is booked and the bundle page shows how much to top up. Example: 2 pairs worth 6,000 each with a 600 rent estimate need 12,600 tokens available; all 12,600 stays locked until the pairs are back, and then only the actual rent is charged.
5. Each item's discount is fixed at booking, and with catch-up on, φ is fixed at the start of the item from the shoe's state before that rental. Neither changes during the rental.

**Deposits.**
- A pair's deposit is its merchant value V, locked from booking until the pair is back and its item closed (and kept while a dispute on it is open). While **any** pair is still at the borrower's home (or out on a trip, or waiting for inspection), its deposit stays locked at the full V.
- Nothing else is taken from a deposit: rent is charged from the balance at close, after the pair's own rent lock is released, and trip fees never go through us (the receiver pays the driver). Only damage to that pair (an upheld claim, up to V) or its loss is charged against it (`chargeFromDeposit`), and never against another pair's deposit.
- When the item closes, its deposit is unlocked (`unlockDeposit`); when the whole rental is settled, anything left is unlocked.

**Tokens** (`src/server/wallet`, append-only `WalletEntry` ledger, 1 token = 1 LKR):
- Top up = a card sale through the gateway; withdraw = refunds of those sales, newest first, up to the available balance. Tokens above the locked deposits and rent estimates are the borrower's money and can be withdrawn at any time; locked tokens can't.
- balance = top-ups + credits − charges − withdrawals; locked = locks − unlocks; available = balance − locked. The balance can go negative (a lost pair worth more than its deposit, or a bundle settled to more wear): the borrower can't book again until it is cleared.
- Rent is post-paid. Each item's rent estimate is locked at booking and its lock moved whenever the plan changes (§6a: `LOCK` more, or `UNLOCK`). Locks carry a purpose (`DEPOSIT` or `RENT`), so damage or loss can only take a pair's deposit. At close the rent lock is released and the item's final charge taken as a `CHARGE` (§7); a `CREDIT` is only ever an upheld refund (or a legacy prepaid item settling down).
- OPEN DECISION (legal): holding customer money as a stored balance may need Central Bank of Sri Lanka approval; check before launch.

---

## 6a. Planning: committed wear and settling changes

**The plan.** Every open item (awaiting delivery, reserved next, held, or returning) has a planned holding:

| Item | Planned first day | Planned last day |
|---|---|---|
| Held or returning | `firstDay` | `lastDay`, else `termEndDay` |
| Awaiting delivery | tomorrow | first + `plannedDays` − 1 |
| Reserved next | max(tomorrow, holder's planned last day + 2) | first + `plannedDays` − 1 |

`replan` (`src/server/booking/plan.ts`) runs the ledger (`wearAdded`, 1/n per borrower) over every borrower's closed and planned holdings, then chains each pair's open items in order with `chainWear`: holder first, then the reserved-next item, starting from the settled `wear`. That gives each item `plannedFirstDay`, `plannedWearStart → plannedWearEnd` and its `plannedCharge` (the rent estimate) from the pricing engine; the pair's `committedWear` is the end of its chain. A new 6,000 LKR pair booked alone for 90 days shows 90/365 used the moment it is booked.

**When it runs:** booking, delivery (dates become real), notice of an early return, extending, the term running out, an offer accepted or rejected, a reservation cancelled, a pair lost, and an item closing.

**Following a change** (the new `plannedCharge`, less anything already charged, against `rentLocked`):

| Item | Estimate goes down | Estimate goes up, or a reservation would start earlier |
|---|---|---|
| Held, returning or awaiting delivery | Unlock the difference | Lock the difference (settle to actual wear) |
| Reserved next | Unlock the difference | An **offer** of the new first day and price: the borrower is told why (the holder is returning early, so the pair can come sooner, with less wear than shown, which costs more per day) in the app and by email, and must accept within `offerResponseHours` (24). Nothing changes until they accept. |

**Reserving from day 1.** A held pair is in Browse ("Reserve next") from its holder's day 1 until someone reserves it. The reservation's first day is the day after the holder's `termEndDay` plus a day for the handoff, and its wear starts at the pair's projected wear at `termEndDay` (the holder's planned wear). A holder who ends on their term's last day hands over as planned, with no offer.

**Offers.** Only a change that moves a reservation's first day earlier (the holder's early-return notice, or a wrong-size return) or raises its estimate makes an offer (`offerFirstDay`, `offerCharge`, `offerWearStart`, `offerDueAt`). While it is pending the holder keeps the pair (if they have already ended, it waits with them, free). Accept (`acceptOffer`): `plannedFirstDay`, `plannedCharge` and `plannedWearStart` take the offered values, the rent lock moves to the new estimate (refused, with nothing changed, if available tokens would go below zero), and the pair is handed over after the holder's last day (`handOffIfWaiting`). Decline (`rejectOffer`: they don't want the new dates or price, or want to keep their original dates, which we can't hold) or no answer by `offerDueAt` (`expireOffers`, the daily job): `cancelReservation` cancels the item, unlocks its deposit and rent estimate, and tells the borrower in the app and by email that the pair came back early and their reservation was cancelled and released. The holder's item gets `holdForNext`: when their term ends (or now, if they have already ended) the pair is **not** collected; it stays with them, free (their last day is fixed, so no rent or wear accrues), and they are told to keep it safe. It shows in Browse as free now; the next booking is priced from its real wear and handed over from the holder straight away (`handOffIfWaiting`). The holder's item closes, and its rent is charged, when that borrower records the pair's condition.

Examples:
- **Early return.** A 90-day term; on day 20 the borrower gives notice for a last day of 30 (10 days ahead). The term becomes days 1–30: wear and the estimate are recalculated to 30 days, the lock for the 60 unused days is released at once, and the pair's `committedWear` drops to 30. They keep the pair until day 30; the daily job ends the term on day 31 and books the driver; at close they are charged for 30 days. Notice on day 25 for day 30 is refused (only 5 days); so is any day on or after the term's last day.
- **Bundle split.** Two pairs for 90 days gain 45 wear-days each. Pair A cut to days 1–30 gains 15; pair B is then held alone and gains 15 + 60 = 75. A's lock goes down and B's up; each is charged its own actual rent at close.
- **Reserved next, early return.** User 1 holds a new pair for days 1–90; on day 1 user 2 reserves it for 30 days from day 92, at wear 90 → 120 (estimate locked: rent(90, 120) plus the 6,000 deposit). On day 20 user 1 gives notice to end on day 30, so the pair could reach user 2 for day 32, at wear 30, where the price is higher. User 2 is offered day 32 at rent(30, 60) and has 24 hours. Accept: their plan and lock move to day 32 and rent(30, 60), and the pair is handed over on day 31. Decline or no answer: the reservation is cancelled, all of user 2's tokens for it unlocked, and user 2 emailed. On day 31 user 1's term ends but nobody collects the pair: user 1 keeps it, free, until user 3 books it (say on day 40, priced from wear 30), and it goes from user 1 straight to user 3. User 1 pays for days 1–30 only.

**Extension.** On or before `termEndDay`, the borrower can add days to a held pair (or one still awaiting delivery), unless someone has reserved it next. The plan is redone and the extra estimate locked; if the available balance would go below zero, nothing changes and they're asked to top up.

**The term running out.** The daily job (`runDailyRentals`, `/api/cron/rentals`) ends every held pair whose term ended yesterday or earlier, with `lastDay = termEndDay`, and books the collection or handoff. Days waiting for the driver are free. It also expires offers past `offerResponseHours` and sends queued emails.

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

3. **Collect the rent** (`collectRent`, in the close-out transaction): release the item's rent lock and charge its final `charge` (less anything already charged) from the balance; `rentPaid` becomes the charge. If the actual rent is more than was locked, the balance may go negative (the borrower must top up before booking again). Then unlock the pair's deposit; keep it locked while a dispute is open.
4. Only now, with the rent collected, is the merchant share credited (`merchantCollected`) and payable: after the dispute window (3 days), in the weekly payout.

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

A held pair can be reserved by the next borrower from its holder's day 1 (§6a). The next borrower gets a discount that starts `releaseLeadDays` before release and grows the closer it gets and the longer the pair then waits:

```
releaseDay   = holder's termEndDay (or lastDay if they ended early)   (Shoe.releaseDay, set on delivery, extension and early end)
windowStart  = releaseDay − releaseLeadDays + 1             (releaseWindowStart)
discount(t)  = min(maxDiscount, releaseDiscountStep × (t − windowStart + 1))   for t ≥ windowStart, else 0
```

For a 90-day term (days 1–90): reservable from day 1 at no discount, then 0.5% off on day 81, 1% on day 82, … 5% on day 90 (release), 10% on day 100 if no one has taken it, and a steady 10% after that, until the pair is rented again (`releaseDiscount`).

- A held pair is in Browse ("Reserve next") from its holder's day 1 until someone reserves it; booking before the window just gets no discount. A pair that is back with the merchant stays listed and keeps counting from the same release day. A pair never rented has no discount.
- The next borrower **locks in the rate of the day they book**, for their whole rental (`RentalItem.discount`, fixed at checkout). Their own term sets the pair's next release day.
- It applies to the next borrower only, never to the current holder.
- It uses the active settings (a platform marketing rule), not the shoe's settings snapshot.
- OPEN DECISION: it is funded by the platform (`PLATFORM`), so the merchant is still paid first. If release discounts on a pair add up to more than the platform's margin, the merchant falls short of their target.
- **Platform promotions** (`PLATFORM`, the default) leave the merchant's target alone, so the platform bears them: it reaches its own share later, or not at all.

---

## 9. Special events

| Event | Calculation |
|---|---|
| Early return | Notice at least `earlyReturnNoticeDays` (10) before the new last day (§5); the term is shortened to it. Replan (§6a): the estimate and wear for the shortened term, the lock for the unused days released at once, `committedWear` lowered. A reserved-next borrower gets an offer of the earlier start at the new price (24 hours, app and email); declined or unanswered, their reservation is cancelled and unlocked, and the pair stays with the holder, free, until a new borrower books it (`holdForNext`). |
| Extension | Before the term ends, if nobody has reserved the pair next: add days, replan, lock the extra estimate (§6a). |
| Term ends | On `termEndDay + 1` the daily job ends the holding with `lastDay = termEndDay`; a driver collects the pair or hands it to the next borrower. Waiting for the driver is free. |
| Direct handoff | The giver's last day is the day they ended the rental (or their term's last day); the receiver's day 1 is the day after delivery (or after the giver's last day, if later). Waiting days in between are free. |
| Shoe reaches L | Wear keeps counting and each further wear-day is charged P(L) until the pair is returned, even past R (`chargePastLife`; the reference engine stopped at L). A pair whose committed wear has reached L can't be booked or reserved (§6); it is retired when the merchant marks it cleaned. |
| Lost shoe | Charge `remainingValue(p, w, lifetimeCollected, settings)`: K × (A − IQ(w)), or R − lifetimeCollected with catch-up. Split merchant first (a new pair: 7,200 → merchant 6,600, platform 600); taken from that pair's deposit, then the free balance (which may go negative), never from another pair's deposit. No rent is charged for the term (its lock is released) and any reservation of the pair cancelled. |
| Refund (upheld dispute) | Up to the item's charge. Up to that item's merchant share comes off the merchant's payout and `merchantCollected`, so later rentals pay the merchant back first; the rest is the platform's cost. |
| Buy it now (Phase 2) | Price = `remainingValue`, same as a lost shoe. Close the item first, then sell. |
| Damage | Assessed through a dispute; an upheld claim charges up to the pair's merchant value against that pair's deposit (kept locked while the dispute is open). Not part of the rent. |
| Wrong size within 24 h | The borrower can end at once, without notice. Close the item at return; charge only the wear-days used (none if ended on the delivery day) and unlock the rest. As for every return, the merchant receiving the pair pays the driver. |

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
| Release discount, 90-day term | Day 80: 0; day 81: 0.5%; day 82: 1%; day 90: 5%; day 91: 5.5%; day 100: 10%; later: 10%; never rented: 0; the whole next rental at the booked rate |
| Worked example (section 12) | A 216.89, B 95.81, total 312.70; all to the merchants (neither target reached) |
| Past the lifespan (`chargePastLife` on) | P(w > L) = P(L) = K · q; 365 → 385 costs 20 × P(L); the 90-day problem's D pays 36.2029 + 2.5 × P(L) and ends at wear 367.5, A–C and E unchanged; the reference scenarios above run with it off |
| Estimate vs final | Equal when the plan is kept; estimate leaves shoe state unchanged. Integration tests (`tests/integration/fixed-term.int.test.ts`) cover post-paid rent (locked at booking, charged at close, then paid out), committed wear, early-return notice and unlocking, bundle settling, reserving from day 1, offers of new dates (24 h; accept, decline → cancel + unlock + email, the pair kept with the holder until the next booking and handed over from them, expiry with the pair already waiting), extension, term end and the lifespan rule; `payments.int.test.ts` covers per-pair deposits. |
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

- `src/lib/pricing/`: `curveParams`, `validateListing`, `Q`, `IQ`, `priceAt`, `shownPrice`, `curveIncome`, `curvePoints`, `targetIncome`, `rentIntegral` (IQ plus P(L) past L), `incomeBetween`, `catchUpPhi`, `lifetimeCollected`, `remainingValue`, `splitCharge` (proportional, for previews), `releaseWindowStart`, `releaseDiscount`, `merchantTarget`, `merchantOutstanding`, `chargedAmounts` (merchant first), `bundleDailyCost`, `idleCostPerDay`, `breakEvenIdleDays`.
- `src/lib/wear-ledger/`: `wearAdded`, `wearEnd`, `colomboDay`, `dayToDate` / `dateToDay` / `dayNumber`, `firstDayAfterDelivery`, `receiverFirstDay`, `plannedLastDay`, `chainWear`, `lifeLeft`; `runLedger`, `estimate`, `buildInvoice` (accrual.ts; carries each shoe's merchant balance across its items).
- `src/server/catalogue/pricing.ts`: `shoeCurve`, `nextPhi`, `shoePricing`, `releaseInfo`, `merchantOwed`, `merchantFundedDiscounts` (a shoe priced with its own settings snapshot). `src/server/catalogue/index.ts`: `listingLimits`, `setLifespanExtension`, `monthsToDays` / `daysToMonths`.
- End of a holding: `endRental`, `scheduleEarlyReturn`, `extendRental`; offers: `acceptOffer` / `rejectOffer`; close-out: `closeItem`, all in `src/server/booking/lifecycle.ts`. Planning: `replan` in `src/server/booking/plan.ts`. Daily job: `runDailyRentals` in `src/server/booking/daily.ts`. Quote: `quoteBundle` in `src/server/booking/checkout.ts`. Lost pair: `markLost` in `src/server/payments/index.ts`.
