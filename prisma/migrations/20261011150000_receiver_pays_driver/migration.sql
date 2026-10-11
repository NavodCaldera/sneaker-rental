-- Delivery fees are not handled by the platform: whoever receives the pair pays the driver
-- directly (the borrower for deliveries and handoffs, the merchant for returns). No booking
-- fee, and the platform never pays a trip.

ALTER TABLE "PricingSettings" DROP COLUMN "deliveryBookingFee";
ALTER TABLE "Delivery" DROP COLUMN "bookingFee";

-- Returns are paid by the merchant receiving the pair.
ALTER TABLE "Delivery" ALTER COLUMN "paidBy" DROP DEFAULT;
UPDATE "Delivery" SET "paidBy" = 'MERCHANT' WHERE "type" = 'COLLECT';
UPDATE "Delivery" SET "paidBy" = 'BORROWER' WHERE "type" <> 'COLLECT';
ALTER TYPE "PartyPays" RENAME TO "PartyPays_old";
CREATE TYPE "PartyPays" AS ENUM ('BORROWER', 'MERCHANT');
ALTER TABLE "Delivery" ALTER COLUMN "paidBy" TYPE "PartyPays" USING ("paidBy"::text::"PartyPays");
ALTER TABLE "Delivery" ALTER COLUMN "paidBy" SET DEFAULT 'BORROWER';
DROP TYPE "PartyPays_old";
