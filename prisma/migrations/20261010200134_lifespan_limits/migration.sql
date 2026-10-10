-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "maxLifespanDays" INTEGER;

-- AlterTable
ALTER TABLE "PricingSettings" ALTER COLUMN "maxLifespanDays" SET DEFAULT 730,
ALTER COLUMN "minLifespanDays" SET DEFAULT 183;

-- Lifespan limits become 6–24 months (183–730 wear-days). Settings are append-only, so add
-- a new version copying the active one, if it still has the old 60–1,095 defaults.
INSERT INTO "PricingSettings" (
  id, "effectiveFrom", "merchantMargin", "platformMargin", floor, "midpointRatio",
  "baseSteepness", "refLife", "minLifespanDays", "maxLifespanDays", "idleDiscountCap",
  "capitalRate", "holdCost", "depositPerPair", "maxPairsPerBundle", "disputeWindowDays",
  "freeReturnHours", "deliveryBookingFee", "catchUpEnabled", "createdById", "createdAt"
)
SELECT gen_random_uuid()::text, now(), "merchantMargin", "platformMargin", floor,
  "midpointRatio", "baseSteepness", "refLife", 183, 730, "idleDiscountCap", "capitalRate",
  "holdCost", "depositPerPair", "maxPairsPerBundle", "disputeWindowDays", "freeReturnHours",
  "deliveryBookingFee", "catchUpEnabled", NULL, now()
FROM (
  SELECT * FROM "PricingSettings"
  WHERE "effectiveFrom" <= now()
  ORDER BY "effectiveFrom" DESC, "createdAt" DESC
  LIMIT 1
) active
WHERE active."minLifespanDays" = 60 AND active."maxLifespanDays" = 1095;
