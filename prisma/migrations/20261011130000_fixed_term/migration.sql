-- Fixed-term, prepaid rentals (pricing-spec.md §6, §6a): rent for the booked term is paid at
-- booking, wear is committed upfront, and changes to the plan are settled in tokens.

CREATE TYPE "NotificationKind" AS ENUM ('PRICE_OFFER', 'RESERVATION_CANCELLED', 'REFUND', 'TERM_ENDED');

-- The overrun check is gone (rent is prepaid); offers to reserved-next borrowers expire instead.
ALTER TABLE "PricingSettings" DROP COLUMN "topUpGraceDays",
DROP COLUMN "topUpLeadDays",
ADD COLUMN "offerResponseHours" INTEGER NOT NULL DEFAULT 48;

ALTER TABLE "Rental" RENAME COLUMN "estimate" TO "prepaidRent";
ALTER TABLE "Rental" DROP COLUMN "recalledAt",
DROP COLUMN "topUpAmount",
DROP COLUMN "topUpDueAt";

ALTER TABLE "RentalItem" ADD COLUMN "offerCharge" DECIMAL(14,2),
ADD COLUMN "offerDueAt" TIMESTAMP(3),
ADD COLUMN "offerWearStart" DECIMAL(28,12),
ADD COLUMN "plannedCharge" DECIMAL(14,2),
ADD COLUMN "plannedWearEnd" DECIMAL(28,12),
ADD COLUMN "plannedWearStart" DECIMAL(28,12),
ADD COLUMN "rentPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "termEndDay" DATE;

-- Closed items were charged at return under the old flow: that rent is paid.
UPDATE "RentalItem" SET "rentPaid" = "charge" WHERE "status" = 'CLOSED' AND "charge" IS NOT NULL;
-- Held items keep their delivery day as day 1; their planned days become the term.
UPDATE "RentalItem" SET "termEndDay" = "firstDay" + ("plannedDays" - 1)
WHERE "firstDay" IS NOT NULL AND "plannedDays" IS NOT NULL;

ALTER TABLE "Shoe" ADD COLUMN "committedWear" DECIMAL(28,12) NOT NULL DEFAULT 0;
UPDATE "Shoe" SET "committedWear" = "wear";

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "rentalItemId" TEXT,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "Notification_emailedAt_idx" ON "Notification"("emailedAt");
CREATE INDEX "RentalItem_status_termEndDay_idx" ON "RentalItem"("status", "termEndDay");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
