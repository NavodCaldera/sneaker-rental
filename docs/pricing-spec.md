# Pricing and Wear Spec

The maths behind the pricing engine (`src/lib/pricing/`) and the wear ledger (`src/lib/wear-ledger/`). Business context is in [business-model.md](business-model.md) §3, §4 and §9.

## Source of truth

1. **`docs/rental_pricing_engine.py`** and **`docs/Rental Pricing Formula Guide v2`** win wherever they exist and disagree with this file. The engine is a port of the Python, function by function.
2. Until they arrive, this file holds. The curve below was worked back from the numbers in the brief, and it reproduces every single-shoe acceptance value (see "Verified values").
3. Two acceptance tests need input data that only those files contain: the **90-day five-shoe A–E invoice** and the **10-user / 4-shoe / 800-day test**. Don't make up their inputs. Leave them as `it.todo` until the files are in `docs/`.

## Symbols

| Symbol | Meaning | Source |
|---|---|---|
| V | Declared value (LKR) | Merchant |
| L | Expected lifespan (wear-days) | Merchant |
| μm, μp | Merchant and platform margins (launch: 0.10 each) | PricingSettings |
| q | Floor (0.30) | PricingSettings |
| w | Shoe's accumulated wear (wear-days), 0 ≤ w ≤ L | Wear ledger |
| d | One-off discount for one rental item, 0 ≤ d < 1 | Rental item |
| φ | Catch-up multiplier (launch: 1) | Pricing engine |

## Curve

The base curve (midpoint 200, steepness 0.03, floor 0.30) is defined at L = 365 and scaled for any L:

```
R  = (1 + μm + μp) · V
m  = 200 · L / 365          (= midpointRatio · L, midpointRatio = 200/365 ≈ 0.548)
β  = 0.03 · 365 / L         (= baseSteepness · 365 / L)

S(w)  = 1 / (1 + e^(β·(w − m)))                     logistic
IS(w) = w − (1/β) · ln(1 + e^(β·(w − m)))           antiderivative of S

Q(w)  = q + (1 − q) · (S(w) − S(L)) / (S(0) − S(L))  normalised: Q(0) = 1, Q(L) = q
IQ(w) = ∫₀ʷ Q = q·w + (1 − q) · [ (IS(w) − IS(0)) − S(L)·w ] / (S(0) − S(L))

A  = IQ(L)                  curve area; ≈ 0.68198 · L. Compute it exactly; don't use the constant.
K  = R / A                  price per wear-day when new
P(w) = K · Q(w)             price per wear-day at wear w
F(w) = K · IQ(w)            curve income from new to wear w (undiscounted, φ = 1)
```

Numerics: compute `ln(1 + e^x)` stably (softplus: for x > 0 use `x + ln(1 + e^(−x))`). All arithmetic in decimal.js with precision ≥ 30, never JS `number`.

## Charges

```
Income(w_start, w_end, d, φ) = (1 − d) · φ · K · [IQ(w_end) − IQ(w_start)]
DiscountCost                 = d · φ · K · [IQ(w_end) − IQ(w_start)]
```

- **Discounts never stack.** Each rental item starts from the undiscounted curve at the shoe's current wear. A discount on one item never changes the next item's price.
- **Catch-up φ** (off at launch, φ = 1). When it's on, recompute it before each rental:
  `φ = (R − collectedSoFar) / (K · [IQ(L) − IQ(w)])`
- **Split** of any amount X:
  `merchant = X · (1 + μm) / (1 + μm + μp)`, `platform = X · μp / (1 + μm + μp)`
- **Discount funding** (§4 rule 4). Platform promotions reduce both shares in proportion, which is the plain split of the discounted income. A merchant idle discount comes from the merchant share only: the platform share is computed on the *undiscounted* income and the merchant gets the rest.
- **Lost shoe / buy-out:** `remainingValue(w) = R − F(w)`, split as normal. (If the Python defines F(w) as actual collected income rather than curve income, follow the Python.)
- **End of life:** at w = L the shoe stops earning. Clamp w_end to L.
- **Idle-cost test:** checks whether discount d pays for itself in idle days saved, using capital rate r and hold cost h from PricingSettings. The brief cites "10% only pays for itself if it saves about 44 idle days" but gives no formula, so take it from the Python. Merchant idle discounts are capped at 5% (`idleDiscountCap`).

## Wear ledger

- A **wear-day** is one calendar day a pair is held. The clock starts on the delivery date.
- On each day a borrower holds n pairs (all their open rental items), each pair gets **1/n** wear-day.
- **Phases:** at close, rebuild the borrower's holding phases (maximal date ranges with a constant set of held items) across the closing item's dates. Other open items count as held. Item wear = Σ (phase days / n_phase).
- `w_end = min(w_start + wearAdded, L)`. Pass `w_start` and `w_end` to the pricing engine.
- Holding without wearing still counts (§6).
- 24-hour free return for wrong size/fit: the borrower is charged only for wear-days actually used.
- Day-boundary convention (same-day start/end, inclusive vs exclusive end) must match the Python. Until then, use half-open `[start, end)` in calendar days, in Asia/Colombo time.

## Rounding

Keep every intermediate value unrounded. Round to 2 dp (half-up) only for an amount that is shown or charged. Shares are computed from the unrounded charge and each is then rounded on its own.

## Verified values (6,000 LKR shoe, L = 365, μm = μp = 0.10)

Checked against the formulas above with a float reference script:

| Quantity | Computed | Brief |
|---|---|---|
| A / L | 0.681976 | 0.68198 |
| P(0) = K | 28.924798 | 28.9248 |
| P(L) | 8.677439 | 8.6774 |
| Income 0→100, d = 0 | 2,866.114278 | 2,866.11 |
| Split of it | 2,627.271422 / 238.842857 | 2,627.27 / 238.84 |
| Income 0→100, d = 0.10 | 2,579.502850 | 2,579.5029 |
| Discount cost | 286.611428 | 286.6114 |
| φ at w = 100 after that | 1.066133 | 1.066133 |
| P(100) with / without catch-up | 29.857982 / 28.005878 | 29.8580 / 28.0059 |
| Three users 0→60→160→365, each 10% off, **φ = 1** | 6,480.000000 | 6,480.0000 |
| Same three users with catch-up on | 6,889.017203 | — |
| Area for L = 730 | 497.842713 | 497.8428 |

Notes:
- The three-user 6,480.0000 figure holds only **without** catch-up. That case is 0.9 × R, the margin-funded launch default.
- For the L = 730 area the brief has 497.8428 and these formulas give 497.84271, a 4th-decimal gap. Assert it with tolerance 1e-3 until the Python settles it.

## Acceptance tests

Every row in [business-model.md §9](business-model.md#9-agent-plan-for-claude-code) must be a test in `src/lib/pricing/__tests__/acceptance.test.ts`. Tolerance: 1e-4 on 4-dp values, exact equality on 2-dp charged amounts.
