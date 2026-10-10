# Sneaker Rental Marketplace — Business Model

Source brief, Oct 10 2026, by Navod Caldera. Converted from the PDF; content kept as written. Section numbers are added so agents can cite them ("§5 rule 3").

## 1. Summary

The platform is an asset-light marketplace that lets people rent sneakers by the wear they actually use, from merchants who own the shoes. We own no inventory: merchants list shoes, borrowers rent them, ride-hailing apps move them, and we run the pricing, booking, payments and trust layer in between.

**One-line pitch:** wear more sneakers than you own, and pay only for the wear you put on them.

**What makes it different:** every shoe is priced on a wear-based curve. A new pair costs more per day than a worn one, and the price falls as the shoe ages, so every pair has a fair price at every point in its life. A borrower holding four pairs pays for roughly one day of wear per day, because wear is split across the pairs they hold.

| Stakeholder | Role in one line |
|---|---|
| Merchants | Own the shoes; list photos, value and expected lifespan; earn over the shoe's life |
| Shoe borrowers | Rent one or more pairs, wear them, return or pass them on; pay per wear-day |
| Ride-hailing apps | Deliver and collect shoes between merchants and borrowers; earn delivery fees |
| Us (the platform) | Price every rental, match supply and demand, take payments, settle payouts, handle trust |

## 2. Stakeholders

Each stakeholder gives one thing the others need and gets paid or served in return; the platform sits in the middle and touches every flow.

**Shoes move by ride-hailing; money moves through us.** Shoes travel from merchants to borrowers, among borrowers, and, once the lifespan is complete, back to the merchant, always carried by ride-hailing drivers. Every payment passes through the platform, which pays out the merchant's share.

Flows: merchants → platform: listings · platform → merchants: payouts · borrowers → platform: payments · platform → borrowers: prices, bookings · platform → ride-hailing: trip bookings, fees · ride-hailing ↔ merchants: shoes to and from · ride-hailing ↔ borrowers: shoes, incl. handoffs.

| Stakeholder | Gives | Gets | Main worry we must solve |
|---|---|---|---|
| Merchants (shoe stores, resellers, individual collectors) | Shoes, photos, declared value, expected lifespan | Income over the shoe's life (cost + margin), demand they could not reach, a dashboard of every pair | Damage, loss, shoes sitting idle |
| Shoe borrowers | A minimum deposit of 5,000 LKR for one pair, 10,000 for two, rising 5,000 per pair; care of the shoe; condition photos; the delivery fee | Many pairs for the price of wearing one, fair prices that fall as shoes age, delivery to the door | Hygiene |
| Ride-hailing apps | Drivers and couriers for pickup, delivery, return and handoff trips | Quick delivery for the shoe borrowers | Clear pickup points, sealed packages, no disputes about damage |
| Us (the platform) | Pricing engine, listings, booking, payments, payouts, trust and dispute handling | A margin on every rental | Liquidity (enough shoes and renters in one city), fraud |

**What we deliberately do not do:** own shoes, store shoes or run couriers. Every physical step belongs to a merchant, a borrower or a ride-hailing driver. This keeps us asset-light, and it means the product must make each of those steps easy and recorded.

**Who can be a merchant:** start with shoe stores and resellers (they have stock and cleaning routines), then open to verified individual collectors once condition checks and deposits are proven.

## 3. How pricing works

The merchant enters three things and the platform computes every price for the shoe's whole life: a new pair starts at about 1.47 × R ÷ L per wear-day and falls to 30% of that at end of life. Exact maths: [pricing-spec.md](pricing-spec.md).

**Merchant inputs per shoe**

| Input | Example | Used for |
|---|---|---|
| Photos (front, side, sole, inside, box) | 5 photos | Listing page and the condition baseline |
| Declared value V | 6,000 LKR | Target income R |
| Expected lifespan L (wear-days) | 365 | Length of the price curve |
| Size, brand, model, category | UK 9, running | Search and filters |

**Target income.** Borrowers together pay R over the shoe's life: **R = (1 + μm + μp) × V**. μm is the merchant's margin and μp is the platform's margin. With both at 0.10, R = 1.20 × V, which is the 120% target used in the formula guide.

**The curve, scaled to each shoe's lifespan.** The formula guide's curve (midpoint 200, steepness 0.03, floor 0.30) was set for L = 365. For any declared L, scale it so the shape stays the same:

- m = 200 × L ÷ 365 · β = 0.03 × 365 ÷ L · A = 0.68198 × L
- K = R ÷ A · P(w) = K × Q(w) · Income = (1 − d) × φ × K × [IQ(w_end) − IQ(w_start)]

For a 6,000 LKR shoe with L = 365 this gives K = 28.92 LKR per wear-day when new and 8.68 LKR at end of life.

**Wear.** A wear-day is one day a pair is held. A borrower holding n pairs on a day adds 1 ÷ n wear-day to each, so holding four pairs costs about the same per day as holding one. The bill is worked out at return from the wear actually added.

**Discounts.** A discount d is a one-off percentage off the curve price for one rental. The next borrower always starts at the undiscounted curve price; discounts never stack.

**Catch-up (optional).** φ = 1 by default. If the platform wants a discounted shoe to still reach R, φ is recomputed after each rental as (R − collected so far) ÷ (remaining curve income). Default for launch: φ = 1, and discounts are paid for out of the margin.

**What this means for merchants:** a longer declared lifespan gives a lower daily price and more rentals, but if the shoe wears out early the merchant loses the uncollected income. That built-in cost keeps lifespan claims honest, and §6 adds a lifespan accuracy score.

The full derivation and worked examples are in the Rental Pricing Formula Guide (v2) and `rental_pricing_engine.py`.

## 4. Revenue model and money flows

Every rental payment is split in a fixed ratio: with μm = μp = 0.10, the merchant gets 1.10 ÷ 1.20 = 91.67% and the platform keeps 8.33%. Over a 6,000 LKR shoe's life that is 6,600 LKR to the merchant and 600 LKR to us.

**Example: a 100-wear-day rental of a new 6,000 LKR shoe**

| Line | Amount (LKR) | Goes to |
|---|---|---|
| Rental charge (wear 0 → 100) | 2,866.11 | Split below |
| Merchant share (91.67%) | 2,627.27 | Merchant |
| Platform share (8.33%) | 238.84 | Us |
| Delivery and collection trips | Quoted by the ride-hailing app | Ride-hailing app, plus our booking fee |
| Deposit hold | Released at return | Borrower (charged only for damage or loss) |

**Revenue streams**

| Stream | Who pays | How it works | Launch? |
|---|---|---|---|
| Rental margin μp | Borrowers | 8.33% of every rental payment | Yes |
| Delivery booking fee | Borrowers | Flat fee per trip booked through us | Yes |
| Damage protection add-on | Borrowers | Small daily fee; covers minor damage instead of the deposit | Phase 2 |
| Featured listings | Merchants | Pay to appear first in search for a week | Phase 2 |
| Borrower membership | Borrowers | Monthly fee for free deliveries and early access to new pairs | Phase 3 |
| Buy-out and end-of-life resale commission | Borrowers, second-hand buyers | Commission on shoes sold through the platform (§7) | Phase 2 |

**Rules for money**

1. **Charge at return.** The borrower's card is pre-authorised for an estimate at booking; the final charge is computed from actual wear when the rental closes.
2. **Deposit.** A hold on the card, released at return once the condition check passes.
3. **Lost shoe.** The borrower pays what the shoe had left to earn, R − F(w), split merchant/platform as normal. The merchant is made whole for the shoe's remaining life.
4. **Discounts.** Promotional discounts the platform runs are taken from both shares in proportion. Idle discounts the merchant switches on come out of the merchant's share only.
5. **Payouts.** A rental's merchant share is released 3 days after it closes, the window for disputes. Payouts go out weekly.
6. **Delivery fees** pass through to the ride-hailing app; we keep only the booking fee.

## 5. Core journeys

Four journeys carry the business; every step records who held the shoe and when, because wear-days are computed from those records.

**5.1 Merchant lists a shoe**
1. Signs up, verifies the business and adds a payout account.
2. Adds a shoe: photos, value V, lifespan L, size, brand, model, pickup address.
3. Sees the computed price curve before publishing: starting price, end price and lifetime income.
4. Publishes. The shoe is Available, priced at P(w) for its current wear.

**5.2 Borrower rents**
1. Browses by size, brand and style; each listing shows today's price per wear-day and the shoe's wear so far.
2. Adds one to four pairs to a bundle and sees the daily cost of the whole bundle.
3. Checks out: card pre-authorised for the estimate plus the deposit hold; a delivery is booked with a ride-hailing app.
4. Receives the shoes and confirms condition with photos in the app. The clock starts on the delivery date.

**5.3 Return or handoff**
1. Borrower ends a pair's rental in the app.
2. If another borrower has reserved that pair, the platform offers a **direct handoff**: the driver takes it straight to the next borrower in a sealed bag with a cleaning kit. Otherwise it goes back to the merchant for cleaning.
3. The receiver (merchant or next borrower) records condition with photos.

**5.4 Invoice and payout**
1. The rental closes when the shoe's condition is recorded.
2. The pricing engine computes wear added, the charge and the split; the borrower's card is charged and the deposit released.
3. After the 3-day dispute window the merchant's share joins the next weekly payout.

## 6. Operations, trust and risk

Because we hold no shoes, trust comes from records: photos at every handover, a deposit on every rental and a score for every merchant and borrower.

| Risk | What we do |
|---|---|
| Damage beyond normal wear | Condition photos at every handover; the receiver flags damage within 24 hours; charged against the deposit after review |
| Lost or unreturned shoe | Borrower pays R − F(w); account locked; deposit captured first |
| Hygiene | Merchant cleans between rentals; direct handoffs only in a sealed bag with a cleaning kit; borrowers rate cleanliness |
| Wrong size or fit | Size guide per model; free return within 24 hours of delivery, charged only for wear-days used |
| Merchant overstates lifespan | Lifespan accuracy score: compare declared L with the wear at which the shoe is retired; low scores lower search ranking |
| Fake or counterfeit shoes | Merchant verification; photo checks of labels and box; strikes and removal |
| Borrower holds a pair without wearing it | Allowed: holding still adds wear-days, so the shoe still earns |
| Courier disputes | Driver photographs the sealed bag at pickup and drop-off; the trip log is attached to the rental |

**Condition grades.** Every handover records a grade (A as new, B light wear, C visible wear, D retire) with photos. The grade does not change the price, which comes from wear, but it flags shoes wearing faster than their curve.

**End of life.** When a shoe reaches L wear-days it stops earning. The merchant chooses to retire it, sell it through the platform's second-hand listing, or donate or recycle it through a partner.

**Disputes.** Either side opens a dispute within 3 days of a rental closing. An admin reviews the photos and trip log and decides; the payout for that rental is held until then.

## 7. Creative ideas and growth features

The strongest ideas come straight from the wear-based pricing: bundles that cost no more than one pair, a fair buy-out price at any moment, and handoffs that skip idle days.

| Idea | How it works | Why it helps | Phase |
|---|---|---|---|
| Sneaker Wardrobe bundles | Hold up to 4 pairs at once; wear is split, so the bundle costs about one pair's daily price | The headline offer: variety without paying for it | MVP |
| Buy it now, at a fair price | A borrower can buy the pair they hold for R − F(w), what it still had left to earn | Merchant gets the same as renting it to end of life; borrower gets a known, falling price | Phase 2 |
| Direct handoff chain | Next borrower is lined up before the current one returns; the driver goes borrower to borrower | Cuts idle days and one trip per rental | MVP |
| Idle discount ladder, capped at 5% | Merchant switches on a 1% a day discount for idle shoes, up to 5%, on the next rental only | Fills idle days; the cap keeps discounts below the idle cost they save | Phase 2 |
| Trusted borrower tiers | Clean returns raise a borrower's tier; higher tiers get lower deposits and first pick of new pairs | Rewards care; lowers the barrier for good customers | Phase 2 |
| Fresh drops | New listings are shown first to members for 48 hours | New pairs are the most valuable part of the curve; members pay for early access | Phase 3 |
| Event packs | 3–7 day rentals for weddings, matches and trips, booked ahead | Predictable demand in quiet weeks | Phase 2 |
| Merchant earnings insights | Earnings per pair, idle days by size and style, suggested stock to list | Merchants list more of what earns | Phase 2 |
| Photo condition check | Return photos are compared with the listing baseline to flag likely damage for review | Faster, fairer disputes | Phase 3 |
| Second life | End-of-life pairs sold, donated or recycled through partners; each user sees pairs not bought | Sustainability story for marketing and press | Phase 3 |

**Not recommended:** discounts above 5% for idle shoes. In the formula guide's example, a 10% discount only pays for itself if it saves about 44 idle days, far more than a short wait usually lasts.

## 8. Web application blueprint

Build one web app with four role views (merchant, borrower, admin, and a courier link for drivers) on a single database, with the pricing engine as a separate, fully tested module that every other part calls.

**Suggested stack** (change freely): Next.js with TypeScript, PostgreSQL with Prisma, a decimal library for all money and wear values, object storage for photos, and a payment gateway that supports card pre-authorisation (for example PayHere; confirm pre-auth support before choosing).

**Modules**

| Module | Responsibility | Depends on |
|---|---|---|
| Pricing engine | Curve per shoe (V, L), prices, charges, discounts, catch-up φ, split, idle-cost test; a port of `rental_pricing_engine.py` | Nothing |
| Identity and roles | Sign-up, verification, roles, borrower tiers, merchant scores | — |
| Catalogue | Shoe listings, photos, search, price-curve preview | Pricing engine |
| Booking | Bundles of up to 4 pairs, reservations, handoff queue, rental items | Catalogue, Pricing engine |
| Wear ledger | Records every holding period; computes wear added per item at close, splitting each day 1 ÷ n across pairs held | Booking |
| Logistics | Delivery quotes and bookings with ride-hailing apps; trip status by webhook; handoff trips | Booking |
| Condition | Photos and grades at every handover; damage flags | Booking, Logistics |
| Payments | Pre-authorisation, final charge, deposit hold and release, refunds | Pricing engine, Wear ledger |
| Payouts | Merchant share after the dispute window, weekly batches | Payments |
| Disputes and admin | Review queue, decisions, settings (μm, μp, floor, curve, caps) | All |

**Data model**

| Entity | Key fields |
|---|---|
| User | id, role (merchant / borrower / admin), name, phone, email, verified, tier |
| Merchant | user_id, business name, payout account, lifespan accuracy score |
| Shoe | id, merchant_id, brand, model, size, photos, value V, lifespan L, wear w, collected so far, lost to discounts, status, latest grade |
| PricingSettings | μm, μp, floor q, midpoint ratio 0.548, base steepness 0.03, idle discount cap, capital rate r, hold cost h |
| Rental | id, borrower_id, status, estimate, deposit hold reference, created at |
| RentalItem | rental_id, shoe_id, start date, end date, wear start, wear end, discount d, φ, charge, merchant share, platform share |
| Delivery | id, rental_item_id, type (deliver / collect / handoff), provider, quote, fee, status, driver photos |
| ConditionReport | shoe_id, rental_item_id, recorded by, grade A–D, photos, notes |
| Payment, Payout, Dispute | amounts, references, status, timestamps |

**Shoe status values:** Draft, Available, Reserved, Out for delivery, With borrower, In handoff, Cleaning, Retired, Sold.

**Wear at close.** A rental item's wear depends on the other pairs its borrower held on the same days. When an item closes, the wear ledger rebuilds that borrower's phases over the item's dates (other open items count as held), adds 1 ÷ n per day capped at L, and passes w_start and w_end to the pricing engine.

## 9. Agent plan for Claude Code

Create seven agents in `.claude/agents/`, build the pricing engine first, and let no other module compute a price or a wear value itself.

| Agent file | Owns | Must deliver |
|---|---|---|
| `pricing-engine.md` | Pricing module and its tests | Curve per (V, L), prices, charges, discounts, φ, split, idle test; pure functions, decimals, no I/O |
| `backend-data.md` | Database schema, migrations, core APIs, roles | The data model in §8; seed data with the test shoes |
| `booking-wear.md` | Booking, bundles, handoff queue, wear ledger | Phases per borrower, 1 ÷ n wear split, cap at L, close-out flow |
| `logistics.md` | Ride-hailing integration | Quote, book, track by webhook, handoff trips; a manual admin fallback until an API is live |
| `payments-payouts.md` | Payments, deposits, payouts | Pre-auth, final charge, deposit release, 3-day hold, weekly payouts |
| `frontend.md` | Merchant, borrower, admin and courier views | Listing with curve preview, bundle checkout, condition photo flow, dashboards |
| `qa-review.md` | End-to-end tests and review | Runs every acceptance test below before any merge |

**Rules every agent follows**
1. Prices and wear come only from the pricing engine and wear ledger.
2. Keep values unrounded; round only what is shown or charged, to 2 decimals.
3. Discounts never stack: always start from the curve price at the shoe's current wear.
4. Use the exact curve ratios: midpoint m = 200 × L ÷ 365, steepness β = 0.03 × 365 ÷ L, floor q = 0.30.

**Acceptance tests for the pricing engine** (from the Rental Pricing Formula Guide v2, μm + μp = 0.20)

| Test | Expected |
|---|---|
| 90-day test problem, five shoes A–E | Invoice 3,030.2730 LKR |
| Hard test problem, 10 users, 4 shoes, 800 days | Every shoe collects exactly R; total 33,600.00 LKR |
| 6,000 LKR shoe, L = 365, new | Price 28.9248 when new, 8.6774 at end of life |
| User 1, wear 0 → 100, 10% off | Income 2,579.5029; discount cost 286.6114 |
| After that, catch-up at wear 100 | φ = 1.066133; User 2 starts at 29.8580 (28.0059 without catch-up) |
| Three users (0→60, 60→160, 160→365), each 10% off | Lifetime 6,480.0000 |
| Split of a 2,866.11 rental | Merchant 2,627.27, platform 238.84 |
| Same shoe declared L = 730 | Curve area 497.8428, so new price is half of the L = 365 case |

**Build order:** pricing engine → schema and roles → catalogue → booking and wear ledger → payments → logistics → payouts and disputes → polish.

## 10. KPIs, roadmap and open decisions

Launch in one city with a few merchants, and judge success by how much of each shoe's life is rented: idle days are the cost that matters most.

**KPIs**

| KPI | Definition | Why it matters |
|---|---|---|
| Utilisation | Days held ÷ days listed, per shoe | Idle days are lost income for merchants |
| Average idle gap | Days between one rental ending and the next starting | Shows whether handoffs and discounts work |
| Target reached | Lifetime collected ÷ R at retirement | Checks that pricing and discounts protect the margin |
| Pairs per borrower | Average pairs held at once | Measures the bundle offer |
| Damage and loss rate | Disputes upheld ÷ rentals closed | Trust and deposit sizing |
| Lifespan accuracy | Wear at retirement ÷ declared L | Keeps merchants honest |
| Delivery success | Trips completed on time ÷ trips booked | Ride-hailing partner quality |

**Roadmap: build the core rental loop first, then grow it**

- **MVP: the rental loop.** Pricing engine and tests · listings with curve preview · bundles of up to 4 pairs · booking and wear ledger · card pre-auth and deposits · deliveries booked by admin · direct handoffs · weekly merchant payouts.
- *Gate: pilot live, tests pass.*
- **Phase 2: fill idle days.** Ride-hailing delivery API · buy it now at R − F(w) · idle discount ladder, max 5% · trusted borrower tiers · event packs · merchant earnings insights · damage protection add-on · featured listings.
- *Gate: KPIs reviewed.*
- **Phase 3: loyalty and reach.** Borrower membership · fresh drops for members · photo condition check · second life: resale, recycle · open to individual collectors.

The MVP proves the core loop in one city; Phase 2 starts once the pilot is live and the pricing acceptance tests pass.

**Open decisions**
- [ ] Split of the 20% margin: μm = μp = 0.10, or another split?
- [ ] Deposit size: a fixed amount, or a share of R − F(w) with a cap?
- [ ] Delivery booking fee amount, and who pays for return trips
- [ ] Is a direct handoff allowed without merchant cleaning, and for which categories?
- [ ] Minimum and maximum lifespan a merchant may declare
- [ ] Catch-up pricing (φ) at launch, or margin-funded discounts only?
- [ ] Which ride-hailing app to integrate first, and whether it offers a delivery API
- [ ] Payment gateway, and whether it supports pre-authorisation
- [ ] Platform name and brand
