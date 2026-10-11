-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "refundOfId" TEXT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refundOfId_fkey" FOREIGN KEY ("refundOfId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

