-- Merchants pick how a pair's price falls with wear: S-curve (logistic, the default and
-- every existing listing) or exponential decay. pricing-spec.md §2.
-- CreateEnum
CREATE TYPE "PricingMethod" AS ENUM ('LOGISTIC', 'EXPONENTIAL');

-- AlterTable
ALTER TABLE "Shoe" ADD COLUMN     "pricingMethod" "PricingMethod" NOT NULL DEFAULT 'LOGISTIC';

