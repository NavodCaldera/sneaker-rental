-- Post-paid rent (pricing-spec.md §6, §6a): the rent estimate is locked at booking and the
-- final rent is charged when the item closes. Reservations open from day 1; a reservation
-- whose holder returns early gets an offer with new dates, and is cancelled if not accepted.

-- Locks say what they hold: a pair's deposit or its rent estimate.
CREATE TYPE "LockPurpose" AS ENUM ('DEPOSIT', 'RENT');
ALTER TABLE "WalletEntry" ADD COLUMN "purpose" "LockPurpose";
UPDATE "WalletEntry" SET "purpose" = 'DEPOSIT'
WHERE "kind" IN ('LOCK', 'UNLOCK') AND "rentalItemId" IS NOT NULL;

-- Rent locked per item; agreed and offered first days for reservations. A pair no longer
-- waits with its holder after a turned-down offer: it goes back to the merchant.
ALTER TABLE "RentalItem" DROP COLUMN "holdForNext",
ADD COLUMN "rentLocked" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "plannedFirstDay" DATE,
ADD COLUMN "offerFirstDay" DATE;

ALTER TABLE "Rental" RENAME COLUMN "prepaidRent" TO "estimatedRent";
