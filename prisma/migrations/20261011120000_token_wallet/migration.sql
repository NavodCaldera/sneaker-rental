-- Tokens replace card holds and deposits: a borrower keeps a token balance (1 token = 1 LKR),
-- paid in through the gateway. Booking locks the pairs' merchant value plus the rent estimate.

CREATE TYPE "WalletEntryKind" AS ENUM ('TOP_UP', 'WITHDRAWAL', 'LOCK', 'UNLOCK', 'CHARGE', 'CREDIT');
ALTER TYPE "PaymentKind" ADD VALUE 'TOP_UP';
ALTER TYPE "PaymentKind" ADD VALUE 'WITHDRAWAL';

-- Payments belong to a user; top-ups and withdrawals have no rental.
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_rentalId_fkey";
ALTER TABLE "Payment" ADD COLUMN "userId" TEXT;
UPDATE "Payment" p SET "userId" = r."borrowerId" FROM "Rental" r WHERE r.id = p."rentalId";
ALTER TABLE "Payment" ALTER COLUMN "userId" SET NOT NULL,
ALTER COLUMN "rentalId" DROP NOT NULL;

-- No more deposit; overrun check settings.
ALTER TABLE "PricingSettings" DROP COLUMN "depositPerPair",
ADD COLUMN "topUpGraceDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "topUpLeadDays" INTEGER NOT NULL DEFAULT 3;

-- Rentals record the pairs' value instead of a deposit and card references.
ALTER TABLE "Rental" ADD COLUMN "shoeValue" DECIMAL(14,2);
UPDATE "Rental" r SET "shoeValue" = COALESCE((
  SELECT SUM(s.value) FROM "RentalItem" i JOIN "Shoe" s ON s.id = i."shoeId" WHERE i."rentalId" = r.id
), 0);
ALTER TABLE "Rental" ALTER COLUMN "shoeValue" SET NOT NULL,
DROP COLUMN "depositAmount",
DROP COLUMN "depositHoldRef",
DROP COLUMN "preAuthRef",
ADD COLUMN "recalledAt" TIMESTAMP(3),
ADD COLUMN "topUpAmount" DECIMAL(14,2),
ADD COLUMN "topUpDueAt" TIMESTAMP(3);

CREATE TABLE "WalletEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "WalletEntryKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "rentalId" TEXT,
    "rentalItemId" TEXT,
    "paymentId" TEXT,
    "note" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WalletEntry_amount_positive" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "WalletEntry_idempotencyKey_key" ON "WalletEntry"("idempotencyKey");
CREATE INDEX "WalletEntry_userId_kind_idx" ON "WalletEntry"("userId", "kind");
CREATE INDEX "WalletEntry_rentalId_kind_idx" ON "WalletEntry"("rentalId", "kind");
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_rentalItemId_fkey" FOREIGN KEY ("rentalItemId") REFERENCES "RentalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
