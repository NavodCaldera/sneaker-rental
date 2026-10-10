-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MERCHANT', 'BORROWER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ShoeStatus" AS ENUM ('DRAFT', 'AVAILABLE', 'RESERVED', 'OUT_FOR_DELIVERY', 'WITH_BORROWER', 'IN_HANDOFF', 'CLEANING', 'RETIRED', 'SOLD');

-- CreateEnum
CREATE TYPE "Grade" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "PhotoKind" AS ENUM ('FRONT', 'SIDE', 'SOLE', 'INSIDE', 'BOX', 'CONDITION', 'DRIVER_PICKUP', 'DRIVER_DROPOFF');

-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RentalItemStatus" AS ENUM ('AWAITING_DELIVERY', 'WAITING_HANDOFF', 'ACTIVE', 'RETURNING', 'CLOSED', 'CANCELLED', 'LOST');

-- CreateEnum
CREATE TYPE "DiscountFunding" AS ENUM ('PLATFORM', 'MERCHANT');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('DELIVER', 'COLLECT', 'HANDOFF');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('REQUESTED', 'QUOTED', 'BOOKED', 'PICKED_UP', 'DELIVERED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PartyPays" AS ENUM ('BORROWER', 'MERCHANT', 'PLATFORM');

-- CreateEnum
CREATE TYPE "ConditionStage" AS ENUM ('RECEIPT', 'RETURN');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PREAUTH', 'PREAUTH_VOID', 'CAPTURE', 'DEPOSIT_HOLD', 'DEPOSIT_RELEASE', 'DEPOSIT_CAPTURE', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UPHELD', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "tier" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "payoutAccount" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "lifespanAccuracyScore" DECIMAL(20,16),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shoe" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "pickupAddress" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "lifespanDays" INTEGER NOT NULL,
    "wear" DECIMAL(28,12) NOT NULL DEFAULT 0,
    "collectedSoFar" DECIMAL(28,12) NOT NULL DEFAULT 0,
    "lostToDiscounts" DECIMAL(28,12) NOT NULL DEFAULT 0,
    "status" "ShoeStatus" NOT NULL DEFAULT 'DRAFT',
    "latestGrade" "Grade",
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shoe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "kind" "PhotoKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "shoeId" TEXT,
    "conditionReportId" TEXT,
    "deliveryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingSettings" (
    "id" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merchantMargin" DECIMAL(20,16) NOT NULL,
    "platformMargin" DECIMAL(20,16) NOT NULL,
    "floor" DECIMAL(20,16) NOT NULL,
    "midpointRatio" DECIMAL(20,16) NOT NULL,
    "baseSteepness" DECIMAL(20,16) NOT NULL,
    "idleDiscountCap" DECIMAL(20,16) NOT NULL,
    "capitalRate" DECIMAL(20,16),
    "holdCost" DECIMAL(20,16),
    "depositPerPair" DECIMAL(14,2) NOT NULL,
    "maxPairsPerBundle" INTEGER NOT NULL,
    "disputeWindowDays" INTEGER NOT NULL,
    "freeReturnHours" INTEGER NOT NULL,
    "deliveryBookingFee" DECIMAL(14,2),
    "catchUpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rental" (
    "id" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "status" "RentalStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "deliveryAddress" TEXT NOT NULL,
    "estimate" DECIMAL(14,2) NOT NULL,
    "depositAmount" DECIMAL(14,2) NOT NULL,
    "depositHoldRef" TEXT,
    "preAuthRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Rental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalItem" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "shoeId" TEXT NOT NULL,
    "status" "RentalItemStatus" NOT NULL DEFAULT 'AWAITING_DELIVERY',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "returnRequestedAt" TIMESTAMP(3),
    "wearStart" DECIMAL(28,12),
    "wearEnd" DECIMAL(28,12),
    "discount" DECIMAL(20,16) NOT NULL DEFAULT 0,
    "discountFunding" "DiscountFunding",
    "phi" DECIMAL(20,16) NOT NULL DEFAULT 1,
    "chargeExact" DECIMAL(28,12),
    "discountCost" DECIMAL(28,12),
    "charge" DECIMAL(14,2),
    "merchantShare" DECIMAL(14,2),
    "platformShare" DECIMAL(14,2),
    "freeReturn" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "payableAt" TIMESTAMP(3),
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "type" "DeliveryType" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'REQUESTED',
    "provider" TEXT NOT NULL,
    "externalRef" TEXT,
    "rentalItemId" TEXT NOT NULL,
    "fromRentalItemId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "quote" DECIMAL(14,2),
    "bookingFee" DECIMAL(14,2),
    "paidBy" "PartyPays" NOT NULL DEFAULT 'BORROWER',
    "courierTokenHash" TEXT,
    "courierTokenExpiry" TIMESTAMP(3),
    "sealedBagConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "cleaningKitConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "bookedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "tripLog" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConditionReport" (
    "id" TEXT NOT NULL,
    "shoeId" TEXT NOT NULL,
    "rentalItemId" TEXT,
    "recordedById" TEXT NOT NULL,
    "stage" "ConditionStage" NOT NULL,
    "grade" "Grade" NOT NULL,
    "notes" TEXT,
    "damageFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConditionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "rentalItemId" TEXT,
    "kind" "PaymentKind" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(14,2) NOT NULL,
    "gateway" TEXT NOT NULL,
    "gatewayRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "batchKey" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "rentalItemId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "amount" DECIMAL(14,2),
    "decision" TEXT,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_userId_key" ON "Merchant"("userId");

-- CreateIndex
CREATE INDEX "Shoe_status_size_brand_idx" ON "Shoe"("status", "size", "brand");

-- CreateIndex
CREATE INDEX "Shoe_merchantId_idx" ON "Shoe"("merchantId");

-- CreateIndex
CREATE INDEX "Photo_shoeId_idx" ON "Photo"("shoeId");

-- CreateIndex
CREATE INDEX "PricingSettings_effectiveFrom_idx" ON "PricingSettings"("effectiveFrom");

-- CreateIndex
CREATE INDEX "Rental_borrowerId_status_idx" ON "Rental"("borrowerId", "status");

-- CreateIndex
CREATE INDEX "RentalItem_shoeId_status_idx" ON "RentalItem"("shoeId", "status");

-- CreateIndex
CREATE INDEX "RentalItem_status_payableAt_idx" ON "RentalItem"("status", "payableAt");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_courierTokenHash_key" ON "Delivery"("courierTokenHash");

-- CreateIndex
CREATE INDEX "Delivery_status_idx" ON "Delivery"("status");

-- CreateIndex
CREATE INDEX "Delivery_rentalItemId_idx" ON "Delivery"("rentalItemId");

-- CreateIndex
CREATE INDEX "ConditionReport_shoeId_idx" ON "ConditionReport"("shoeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_rentalId_idx" ON "Payment"("rentalId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_merchantId_batchKey_key" ON "Payout"("merchantId", "batchKey");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shoe" ADD CONSTRAINT "Shoe_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_shoeId_fkey" FOREIGN KEY ("shoeId") REFERENCES "Shoe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_conditionReportId_fkey" FOREIGN KEY ("conditionReportId") REFERENCES "ConditionReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalItem" ADD CONSTRAINT "RentalItem_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalItem" ADD CONSTRAINT "RentalItem_shoeId_fkey" FOREIGN KEY ("shoeId") REFERENCES "Shoe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalItem" ADD CONSTRAINT "RentalItem_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_rentalItemId_fkey" FOREIGN KEY ("rentalItemId") REFERENCES "RentalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_fromRentalItemId_fkey" FOREIGN KEY ("fromRentalItemId") REFERENCES "RentalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionReport" ADD CONSTRAINT "ConditionReport_shoeId_fkey" FOREIGN KEY ("shoeId") REFERENCES "Shoe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionReport" ADD CONSTRAINT "ConditionReport_rentalItemId_fkey" FOREIGN KEY ("rentalItemId") REFERENCES "RentalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionReport" ADD CONSTRAINT "ConditionReport_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_rentalItemId_fkey" FOREIGN KEY ("rentalItemId") REFERENCES "RentalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_rentalItemId_fkey" FOREIGN KEY ("rentalItemId") REFERENCES "RentalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
