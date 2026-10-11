-- Early returns need notice (pricing-spec.md §6a): the borrower asks at least
-- earlyReturnNoticeDays before the new last day. Offers to a reserved-next borrower now
-- expire after 24 hours.

ALTER TABLE "PricingSettings" ADD COLUMN "earlyReturnNoticeDays" INTEGER NOT NULL DEFAULT 10,
ALTER COLUMN "offerResponseHours" SET DEFAULT 24;
-- 48 hours was only ever the unreleased step-13 default.
UPDATE "PricingSettings" SET "offerResponseHours" = 24 WHERE "offerResponseHours" = 48;

ALTER TABLE "RentalItem" ADD COLUMN "earlyReturnAt" TIMESTAMP(3),
ADD COLUMN "holdForNext" BOOLEAN NOT NULL DEFAULT false;
