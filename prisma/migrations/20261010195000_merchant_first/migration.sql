-- Merchant first: rent goes to the merchant until they reach their target, then to the
-- platform. Track the merchant shares charged per shoe, net of refunds.
ALTER TABLE "Shoe" ADD COLUMN "merchantCollected" DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE "Shoe" s SET "merchantCollected" = COALESCE((
  SELECT SUM(i."merchantShare") - COALESCE(SUM((
    SELECT SUM(LEAST(d.amount, i."merchantShare"))
    FROM "Dispute" d
    WHERE d."rentalItemId" = i.id AND d.status = 'UPHELD' AND d.resolution = 'REFUND_BORROWER'
  )), 0)
  FROM "RentalItem" i
  WHERE i."shoeId" = s.id AND i.status IN ('CLOSED', 'LOST') AND i."merchantShare" IS NOT NULL
), 0);

-- Charging stops on the day the borrower ends a rental: pairs on their way back end then.
UPDATE "RentalItem"
SET "lastDay" = (("returnRequestedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Colombo')::date
WHERE status = 'RETURNING' AND "returnRequestedAt" IS NOT NULL;
