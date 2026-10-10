-- Rent calculation spec: settings snapshot per shoe, lifespan limits and idle-cost inputs
-- in settings, second-hand wear, and inclusive wear-ledger days.

-- PricingSettings: new fields; fill the idle-cost inputs before making them required.
ALTER TABLE "PricingSettings" ADD COLUMN "maxLifespanDays" INTEGER NOT NULL DEFAULT 1095,
ADD COLUMN "minLifespanDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN "refLife" INTEGER NOT NULL DEFAULT 365;
UPDATE "PricingSettings" SET "capitalRate" = 0.12 WHERE "capitalRate" IS NULL;
UPDATE "PricingSettings" SET "holdCost" = 0 WHERE "holdCost" IS NULL;
ALTER TABLE "PricingSettings" ALTER COLUMN "capitalRate" SET NOT NULL,
ALTER COLUMN "capitalRate" SET DEFAULT 0.12,
ALTER COLUMN "holdCost" SET NOT NULL,
ALTER COLUMN "holdCost" SET DEFAULT 0;

-- RentalItem: ledger days (inclusive, Asia/Colombo dates). Backfill from the delivery
-- timestamps; a pair received by handoff starts the day after the handoff.
ALTER TABLE "RentalItem" ADD COLUMN "firstDay" DATE,
ADD COLUMN "lastDay" DATE;
UPDATE "RentalItem" i SET "firstDay" = (("startDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Colombo')::date
  + CASE WHEN EXISTS (
      SELECT 1 FROM "Delivery" d
      WHERE d."rentalItemId" = i.id AND d.type = 'HANDOFF' AND d.status = 'DELIVERED'
    ) THEN 1 ELSE 0 END
WHERE "startDate" IS NOT NULL;
UPDATE "RentalItem" SET "lastDay" = (("endDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Colombo')::date
WHERE "endDate" IS NOT NULL;

-- Shoe: second-hand wear, and the settings version each shoe is priced with. Existing
-- shoes take the settings version active now.
ALTER TABLE "Shoe" ADD COLUMN "initialWear" DECIMAL(28,12) NOT NULL DEFAULT 0,
ADD COLUMN "settingsId" TEXT;
UPDATE "Shoe" SET "settingsId" = (
  SELECT id FROM "PricingSettings"
  WHERE "effectiveFrom" <= now()
  ORDER BY "effectiveFrom" DESC, "createdAt" DESC
  LIMIT 1
);
ALTER TABLE "Shoe" ALTER COLUMN "settingsId" SET NOT NULL;
ALTER TABLE "Shoe" ADD CONSTRAINT "Shoe_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "PricingSettings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
