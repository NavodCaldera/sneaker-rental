-- CreateEnum
CREATE TYPE "DisputeResolution" AS ENUM ('CHARGE_DEPOSIT', 'REFUND_BORROWER', 'NO_ACTION');

-- AlterTable
ALTER TABLE "Dispute" ADD COLUMN     "resolution" "DisputeResolution";
