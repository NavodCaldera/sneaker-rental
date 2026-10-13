-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "birthdayFreePairs" INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE "RentalItem" ADD COLUMN     "birthdayFree" DECIMAL(28,12),
ADD COLUMN     "plannedBirthdayFree" DECIMAL(14,2);

