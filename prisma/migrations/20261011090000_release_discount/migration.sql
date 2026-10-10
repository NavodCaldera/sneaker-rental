-- Release discount: the next borrower of a pair gets a discount that grows from 10 days
-- before the current holder's planned last day, 0.5% a day, up to 10%.

ALTER TABLE "PricingSettings" RENAME COLUMN "idleDiscountCap" TO "maxDiscount";
ALTER TABLE "PricingSettings" ALTER COLUMN "maxDiscount" SET DEFAULT 0.10,
ADD COLUMN "releaseLeadDays" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "releaseDiscountStep" DECIMAL(20,16) NOT NULL DEFAULT 0.005;

ALTER TABLE "RentalItem" ADD COLUMN "plannedDays" INTEGER;
ALTER TABLE "Shoe" ADD COLUMN "releaseDay" DATE;

-- Settings are append-only: add a version with the 10% cap if the active one has the old 5%.
INSERT INTO "PricingSettings" (
  id, "effectiveFrom", "merchantMargin", "platformMargin", floor, "midpointRatio",
  "baseSteepness", "refLife", "minLifespanDays", "maxLifespanDays", "maxDiscount",
  "releaseLeadDays", "releaseDiscountStep", "capitalRate", "holdCost", "depositPerPair",
  "maxPairsPerBundle", "disputeWindowDays", "freeReturnHours", "deliveryBookingFee",
  "catchUpEnabled", "createdById", "createdAt"
)
SELECT gen_random_uuid()::text, now(), "merchantMargin", "platformMargin", floor,
  "midpointRatio", "baseSteepness", "refLife", "minLifespanDays", "maxLifespanDays", 0.10,
  10, 0.005, "capitalRate", "holdCost", "depositPerPair", "maxPairsPerBundle",
  "disputeWindowDays", "freeReturnHours", "deliveryBookingFee", "catchUpEnabled", NULL, now()
FROM (
  SELECT * FROM "PricingSettings"
  WHERE "effectiveFrom" <= now()
  ORDER BY "effectiveFrom" DESC, "createdAt" DESC
  LIMIT 1
) active
WHERE active."maxDiscount" = 0.05;
