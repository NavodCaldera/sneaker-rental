/**
 * Acceptance tests (pricing-spec.md "Acceptance tests"; Rental Pricing Formula Guide v2,
 * μm + μp = 0.20). Ported from the reference rent engine's test suite.
 * 4-dp values: tolerance 1e-4 unless stated. 2-dp charged amounts: exact.
 */
import { describe, expect, it } from "vitest";
import type Decimal from "decimal.js";
import { D } from "../../decimal";
import {
  DEFAULT_PRICING_SETTINGS as S,
  IQ,
  type PricingSettings,
  breakEvenIdleDays,
  catchUpPhi,
  chargedAmounts,
  curveParams,
  idleCostPerDay,
  incomeBetween,
  lifetimeCollected,
  merchantTarget,
  priceAt,
  releaseDiscount,
  releaseWindowStart,
  remainingValue,
  roundMoney,
  splitCharge,
  validateListing,
} from "..";
import {
  type LedgerItem,
  type LedgerShoe,
  buildInvoice,
  dayNumber,
  estimate,
  runLedger,
} from "../../wear-ledger";

function near(actual: Decimal, expected: Decimal.Value, tol: Decimal.Value = "1e-4", msg = "") {
  const diff = actual.minus(expected).abs();
  expect(diff.lte(tol), `${msg} ${actual.toFixed(8)} ≠ ${expected} (±${tol})`).toBe(true);
}

const MAX = { maxPairs: 4 };
/** Merchant targets of the shoes made in each test, for the merchant-first split. */
const targets = new Map<string, D>();
const owedFor = (shoeId: string) => targets.get(shoeId)!;

function newShoe(id: string, V: number, L: number, w0: Decimal.Value = 0, s = S): LedgerShoe {
  const curve = curveParams(V, L, s);
  targets.set(id, merchantTarget(curve, w0, s));
  return {
    id,
    curve,
    wear: new D(w0),
    collected: lifetimeCollected(curve, w0, 0),
    lostToDiscounts: new D(0),
    catchUp: s.catchUp,
  };
}
const shoesMap = (list: LedgerShoe[]) => new Map(list.map((s) => [s.id, s]));
const item = (
  id: string,
  borrowerId: string,
  shoeId: string,
  start: number,
  end: number | null,
  discount: Decimal.Value = 0,
): LedgerItem => ({ id, borrowerId, shoeId, start, end, discount });

const shoe = curveParams(6000, 365, S);

describe("single shoe", () => {
  it("6,000 LKR shoe, L = 365: A 248.9214, K 28.9248, end-of-life price 8.6774", () => {
    near(shoe.A, "248.9214", "1e-4", "area");
    expect(shoe.R.eq(7200)).toBe(true);
    near(shoe.K, "28.9248", "1e-4", "K");
    near(priceAt(shoe, 0), "28.9248");
    near(priceAt(shoe, 365), "8.6774");
    near(shoe.K.times(shoe.A), 7200, "1e-25", "lifetime = R");
  });

  it("same shoe declared L = 730: area 497.8428, new price halves, floor still 30%", () => {
    const long = curveParams(6000, 730, S);
    near(long.A, "497.8428", "1e-4", "area");
    near(priceAt(long, 0).times(2), priceAt(shoe, 0), "1e-25");
    near(priceAt(long, 730), priceAt(long, 0).times("0.3"), "1e-25", "floor");
  });

  it("User 1, wear 0 → 100 at 10% off: 2,579.5029, discount cost 286.6114", () => {
    const { income, discountCost } = incomeBetween(shoe, 0, 100, "0.10");
    near(income, "2579.5029");
    near(discountCost, "286.6114");
  });

  it("next renter at wear 100 starts at 28.0059 (Option A) or 29.8580 with φ = 1.066133 (Option B)", () => {
    near(priceAt(shoe, 100), "28.0059");
    const phi = catchUpPhi(shoe, incomeBetween(shoe, 0, 100, "0.10").income, 100);
    near(phi, "1.066133", "1e-6", "phi");
    near(phi.times(priceAt(shoe, 100)), "29.8580");
  });

  it("a 100-wear-day rental of a new shoe charges 2,866.11 (§4 example)", () => {
    const { income } = incomeBetween(shoe, 0, 100);
    expect(roundMoney(income).toFixed(2)).toBe("2866.11");
  });

  it("lifetime ratio of 2,866.11 (brief §9): merchant 2,627.27, platform 238.84", () => {
    // Over a shoe's whole life the merchant receives 110/120 of R; rentals pay merchant first.
    const { merchant, platform } = splitCharge(S, "2866.11");
    expect(roundMoney(merchant).toFixed(2)).toBe("2627.27");
    expect(roundMoney(platform).toFixed(2)).toBe("238.84");
  });

  it("merchant first: a charge fills what the merchant is owed, the platform gets the rest", () => {
    const owed = (o: string) => chargedAmounts("2866.11", { merchantOutstanding: o });
    expect(owed("6600").merchantShare.toFixed(2)).toBe("2866.11");
    expect(owed("6600").platformShare.toFixed(2)).toBe("0.00");
    expect(owed("1000.004").merchantShare.toFixed(2)).toBe("1000.00");
    expect(owed("1000.004").platformShare.toFixed(2)).toBe("1866.11");
    expect(owed("0").platformShare.toFixed(2)).toBe("2866.11");
    expect(owed("-5").merchantShare.toFixed(2)).toBe("0.00");
    for (const amt of ["0.01", "0.05", "1.99", "123.45", "9999.99"]) {
      const { charge, merchantShare, platformShare } = chargedAmounts(amt, {
        merchantOutstanding: "50.555",
      });
      expect(merchantShare.plus(platformShare).eq(charge)).toBe(true);
    }
  });

  it("merchant target: (1 + μm) · V new; for a second-hand pair, the share still collectable", () => {
    expect(merchantTarget(shoe, 0, S).eq(6600)).toBe(true);
    const b = curveParams(8000, 365, S);
    near(merchantTarget(b, 50, S), new D(8800).times(new D(1).minus(IQ(b, 50).div(b.A))), "1e-25");
    expect(merchantTarget(shoe, 0, S, "100").eq(6500)).toBe(true);
  });

  it("remaining value at wear 100 is 7,200 − 2,866.1143; idle cost 1.9726 a day", () => {
    near(remainingValue(shoe, 100, 0, S), new D(7200).minus("2866.1143"), "1e-3");
    near(idleCostPerDay(6000, S), "1.9726");
  });

  it("idle-cost test: 5% off a 30-wear-day rental from new needs about 22 idle days saved", () => {
    near(breakEvenIdleDays(shoe, 0, 30, "0.05", S), "22.0", "0.05");
    // The brief (§7): a 10% discount only pays for itself if it saves about 44 idle days.
    near(breakEvenIdleDays(shoe, 0, 30, "0.10", S), "44.0", "0.1"); // 43.94
  });

  it("guards: lifespan outside 6–24 months at listing, value ≤ 0, discount outside [0, 1)", () => {
    expect(() => validateListing(6000, 182, S)).toThrow(/between 183 and 730/);
    expect(() => validateListing(6000, 731, S)).toThrow(/Lifespan/);
    expect(() => validateListing(6000, 183, S)).not.toThrow();
    expect(() => validateListing(6000, 730, S)).not.toThrow();
    // An admin-extended limit, and a shoe listed under one is still priced later.
    expect(() => validateListing(6000, 1095, { minLife: 183, maxLife: 1095 })).not.toThrow();
    expect(curveParams(6000, 1095, S).K.gt(0)).toBe(true);
    expect(() => validateListing(0, 365, S)).toThrow(/value/);
    expect(() => curveParams(0, 365, S)).toThrow(/value/);
    expect(() => incomeBetween(shoe, 0, 1, 1)).toThrow(/Discount/);
  });

  it("rounding is half away from zero; calendar days count from dates", () => {
    expect(roundMoney("2.345").toFixed(2)).toBe("2.35");
    expect(roundMoney("-2.345").toFixed(2)).toBe("-2.35");
    expect(dayNumber("2026-10-11") - dayNumber("2026-10-01")).toBe(10);
  });
});

describe("release discount (next borrower of a pair)", () => {
  // The first borrower planned 90 days (days 1–90): release day 90.
  const at = (day: number) => releaseDiscount(day, 90, S).toString();

  it("shows the pair from day 81, 0.5% off, rising 0.5% a day: 5% on day 90, 10% on day 100", () => {
    expect(releaseWindowStart(90, S)).toBe(81);
    expect(at(80)).toBe("0");
    expect(at(81)).toBe("0.005");
    expect(at(82)).toBe("0.01");
    expect(at(90)).toBe("0.05");
    expect(at(91)).toBe("0.055");
    expect(at(100)).toBe("0.1");
  });

  it("stays at the 10% maximum after that, and a never-rented pair gets none", () => {
    expect(at(101)).toBe("0.1");
    expect(at(400)).toBe("0.1");
    expect(releaseDiscount(100, null, S).eq(0)).toBe(true);
  });

  it("the second borrower's whole rental is charged at the rate of the day they booked", () => {
    // Booked on day 90 (5% off): every wear-day of their rental is 5% cheaper.
    const full = incomeBetween(shoe, 90, 100).income;
    const booked = incomeBetween(shoe, 90, 100, releaseDiscount(90, 90, S)).income;
    near(booked, full.times("0.95"), "1e-25");
  });
});

describe("ledger scenarios", () => {
  it("90-day test problem, five shoes A–E: invoice 3,030.2730", () => {
    const shoes = shoesMap([
      newShoe("A", 6000, 365, 0),
      newShoe("B", 7500, 365, 40),
      newShoe("C", 9000, 365, "120.5"),
      newShoe("D", 5000, 365, 360),
      newShoe("E", 8000, 365, 0),
    ]);
    const items = [
      item("a", "cust", "A", 1, 60),
      item("b", "cust", "B", 1, 35),
      item("c", "cust", "C", 11, 75),
      item("d", "cust", "D", 21, 50),
      item("e", "cust", "E", 36, 90),
    ];
    const { results } = runLedger(items, shoes, 1, 90, MAX);
    const inv = buildInvoice(results.values(), owedFor);
    near(inv.totalUnrounded, "3030.2730", "1e-4", "total");
    const expected: Record<string, string> = {
      a: "554.0527",
      b: "434.6162",
      c: "865.6896",
      d: "36.2029",
      e: "1139.7117",
    };
    for (const [id, v] of Object.entries(expected)) near(results.get(id)!.amount, v, "1e-4", id);
    expect(results.get("d")!.wearEnd.eq(365)).toBe(true);
    expect(results.get("d")!.uncharged.eq("2.5")).toBe(true);
    near(results.get("a")!.wearAdded, "19.1667", "1e-4", "A wear");
  });

  it("hard test problem: 10 borrowers, 4 shoes, 800 days; every shoe collects exactly R", () => {
    const shoes = shoesMap([
      newShoe("S1", 6000, 365),
      newShoe("S2", 7500, 365),
      newShoe("S3", 9000, 365),
      newShoe("S4", 5500, 365),
    ]);
    const raw: [string, string, number, number][] = [
      ["U1", "S1", 1, 90],
      ["U1", "S2", 1, 45],
      ["U2", "S3", 5, 120],
      ["U2", "S4", 5, 60],
      ["U2", "S2", 50, 100],
      ["U3", "S4", 70, 200],
      ["U3", "S1", 95, 160],
      ["U4", "S2", 110, 230],
      ["U5", "S3", 130, 300],
      ["U5", "S1", 170, 260],
      ["U5", "S4", 210, 280],
      ["U6", "S2", 240, 400],
      ["U6", "S1", 270, 330],
      ["U7", "S4", 290, 420],
      ["U7", "S3", 310, 380],
      ["U8", "S1", 340, 520],
      ["U8", "S3", 390, 500],
      ["U8", "S2", 410, 470],
      ["U9", "S4", 430, 575],
      ["U9", "S2", 480, 560],
      ["U10", "S3", 510, 800],
      ["U10", "S1", 530, 780],
      ["U10", "S4", 610, 720],
      ["U10", "S2", 650, 760],
    ];
    const items = raw.map(([u, sh, a, b]) => item(`${u}|${sh}`, u, sh, a, b));
    const { results } = runLedger(items, shoes, 1, 800, MAX);
    const expected: Record<string, string> = {
      "U1|S1": "1944.845193",
      "U1|S2": "812.903655",
      "U2|S3": "2860.056107",
      "U2|S4": "693.166927",
      "U2|S2": "852.931147",
      "U3|S4": "2545.219284",
      "U3|S1": "935.268545",
      "U4|S2": "4120.641786",
      "U5|S3": "4291.105084",
      "U5|S1": "1008.46553",
      "U5|S4": "648.407609",
      "U6|S2": "2456.978004",
      "U6|S1": "760.074049",
      "U7|S4": "1654.275502",
      "U7|S3": "1070.713433",
      "U8|S1": "1805.485943",
      "U8|S3": "979.928481",
      "U8|S2": "236.844731",
      "U9|S4": "956.481914",
      "U9|S2": "449.075778",
      "U10|S3": "1598.196894",
      "U10|S1": "745.86074",
      "U10|S4": "102.448764",
      "U10|S2": "70.624898",
    };
    for (const [id, v] of Object.entries(expected)) near(results.get(id)!.amount, v, "1e-5", id);
    const total = [...results.values()].reduce((t, r) => t.plus(r.amount), new D(0));
    near(total, 33600, "1e-6", "platform total");
    for (const sh of shoes.values()) {
      expect(sh.wear.eq(365), `${sh.id} wear`).toBe(true);
      near(sh.collected, sh.curve.R, "1e-20", `${sh.id} collected`);
    }
    // Merchant first: each merchant gets 1.1 V, the platform 0.1 V, and the platform earns
    // nothing on a shoe until its merchant is paid in full.
    const inv = buildInvoice(results.values(), owedFor);
    near(inv.merchantTotal, "30800", "0.05", "merchants");
    near(inv.platformTotal, "2800", "0.05", "platform");
    expect(inv.lines.find((l) => l.itemId === "U1|S1")!.platformShare.eq(0)).toBe(true);
    for (const sh of shoes.values()) {
      const paid = inv.lines
        .filter((l) => l.shoeId === sh.id)
        .reduce((t, l) => t.plus(l.merchantShare), new D(0));
      expect(paid.eq(sh.curve.V.times("1.1")), `${sh.id} merchant paid ${paid}`).toBe(true);
    }
    // S1's merchant is filled during U10's rental (6,454.15 paid before it).
    const crossing = inv.lines.find((l) => l.itemId === "U10|S1")!;
    expect(crossing.merchantShare.toFixed(2)).toBe("145.85");
  });

  it("discounts never stack through the ledger; catch-up restores R", () => {
    const run = (s: PricingSettings) => {
      const shoes = shoesMap([newShoe("X", 6000, 365, 0, s)]);
      const items = [
        item("u1", "U1", "X", 1, 100, "0.1"),
        item("u2", "U2", "X", 101, 200),
        item("u3", "U3", "X", 201, 365),
      ];
      const { results } = runLedger(items, shoes, 1, 365, MAX);
      return { results, shoe: shoes.get("X")! };
    };
    const a = run(S);
    near(a.results.get("u2")!.priceStart, "28.0059", "1e-4", "Option A: U2 starts on the curve");
    near(a.shoe.collected, new D(7200).minus("286.6114"), "1e-3", "Option A lifetime");
    const b = run({ ...S, catchUp: true });
    near(b.results.get("u2")!.priceStart, "29.8580", "1e-4", "Option B: U2 at catch-up price");
    near(b.shoe.collected, 7200, "1e-20", "Option B lifetime = R");
  });

  it("three renters each 10% off collect 6,480", () => {
    const shoes = shoesMap([newShoe("X", 6000, 365)]);
    const items = [
      item("1", "U1", "X", 1, 60, "0.1"),
      item("2", "U2", "X", 61, 160, "0.1"),
      item("3", "U3", "X", 161, 365, "0.1"),
    ];
    const { results } = runLedger(items, shoes, 1, 365, MAX);
    near(shoes.get("X")!.collected, 6480, "1e-20");
    // Merchant first: all 6,480 goes to the merchant, still 120 short of 6,600.
    const inv = buildInvoice(results.values(), owedFor);
    expect(inv.merchantTotal.toFixed(2)).toBe("6480.00");
    expect(inv.platformTotal.toFixed(2)).toBe("0.00");
  });

  it("a merchant-funded 5% idle discount lowers the merchant's target; a promotion the platform's take", () => {
    const run = (fundedBy: "platform" | "merchant") => {
      const shoes = shoesMap([newShoe("A", 6000, 365)]);
      const items: LedgerItem[] = [
        { ...item("a", "B", "A", 1, 30, "0.05"), discountFundedBy: fundedBy },
        item("b", "C", "A", 31, 365),
      ];
      return buildInvoice(runLedger(items, shoes, 1, 365, MAX).results.values(), owedFor);
    };
    const promo = run("platform");
    const idle = run("merchant");
    const cost = idle.lines[0].gross.minus(idle.lines[0].amount);
    expect(promo.total.eq(idle.total)).toBe(true);
    near(promo.merchantTotal, 6600, "0.01", "promotion: merchant whole");
    near(promo.platformTotal, new D(600).minus(cost), "0.01", "promotion: platform pays");
    near(idle.merchantTotal, new D(6600).minus(cost), "0.01", "idle: merchant pays");
    near(idle.platformTotal, 600, "0.01", "idle: platform whole");
    expect(
      idle.lines[0].discountGiven.eq(roundMoney(idle.lines[0].gross).minus(idle.lines[0].charge)),
    ).toBe(true);
  });

  it("worked example: A days 1–10, B days 6–10 → 216.89 + 95.81 = 312.70", () => {
    const shoes = shoesMap([newShoe("A", 6000, 365), newShoe("B", 8000, 365, 50)]);
    const items = [item("a", "C", "A", 1, 10), item("b", "C", "B", 6, 10)];
    const inv = buildInvoice(runLedger(items, shoes, 1, 10, MAX).results.values(), owedFor);
    const [a, b] = inv.lines;
    expect(a.wearEnd.eq("7.5")).toBe(true);
    expect(b.wearEnd.eq("52.5")).toBe(true);
    expect(a.charge.toFixed(2)).toBe("216.89");
    expect(b.charge.toFixed(2)).toBe("95.81");
    // Merchant first: neither merchant has reached their target, so all of it is theirs.
    expect(a.merchantShare.toFixed(2)).toBe("216.89");
    expect(b.merchantShare.toFixed(2)).toBe("95.81");
    expect(inv.total.toFixed(2)).toBe("312.70");
    expect(inv.merchantTotal.toFixed(2)).toBe("312.70");
    expect(inv.platformTotal.toFixed(2)).toBe("0.00");
  });

  it("4 pairs held one day: each gains 0.25 wear-day; total ≈ one new pair-day", () => {
    const ids = ["P", "Q", "R", "S"];
    const shoes = shoesMap(ids.map((id) => newShoe(id, 6000, 365)));
    const items = ids.map((sh) => item(sh, "B", sh, 1, 1));
    const inv = buildInvoice(runLedger(items, shoes, 1, 1, MAX).results.values(), owedFor);
    near(inv.totalUnrounded, incomeBetween(shoe, 0, "0.25").income.times(4), "1e-25", "exact");
    near(inv.totalUnrounded, incomeBetween(shoe, 0, 1).income, "0.01", "about one pair-day");
    for (const l of inv.lines) expect(l.wearAdded.eq("0.25")).toBe(true);
  });

  it("estimate equals the final charge when the plan is kept, and leaves shoe state unchanged", () => {
    const shoes = shoesMap([newShoe("A", 6000, 365), newShoe("B", 8000, 365, 50)]);
    const items = [item("a", "C", "A", 10, 40), item("b", "C", "B", 20, 30, "0.05")];
    const est = estimate(items, shoes, owedFor, MAX);
    expect(shoes.get("A")!.wear.eq(0)).toBe(true);
    const fin = buildInvoice(runLedger(items, shoes, 10, 40, MAX).results.values(), owedFor);
    expect(est.total.eq(fin.total)).toBe(true);
  });

  it("an open item accrues to the run date (running bill)", () => {
    const shoes = shoesMap([newShoe("A", 6000, 365)]);
    const { results } = runLedger([item("a", "C", "A", 1, null)], shoes, 1, 10, MAX);
    expect(results.get("a")!.wearAdded.eq(10)).toBe(true);
    near(results.get("a")!.amount, incomeBetween(shoe, 0, 10).income, "1e-25");
  });

  it("guards: double booking and more than 4 pairs throw", () => {
    const one = shoesMap([newShoe("A", 6000, 365)]);
    expect(() =>
      runLedger([item("x", "U1", "A", 1, 10), item("y", "U2", "A", 10, 20)], one, 1, 20, MAX),
    ).toThrow(/double-booked/);
    const ids = ["1", "2", "3", "4", "5"];
    const five = shoesMap(ids.map((id) => newShoe(id, 6000, 365)));
    expect(() =>
      runLedger(
        ids.map((id) => item(id, "B", id, 1, 1)),
        five,
        1,
        1,
        MAX,
      ),
    ).toThrow(/holds 5 pairs/);
  });
});
