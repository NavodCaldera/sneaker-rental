-- Each customer and merchant account has one address, entered at sign-up: customers' pairs
-- are delivered to and collected from it, merchants' pairs are picked up from and returned
-- to it. It replaces the address typed at checkout (Rental) and per listing (Shoe); trips
-- still copy the addresses they use (Delivery.fromAddress / toAddress).
ALTER TABLE "User" ADD COLUMN "address" TEXT;

-- Keep the latest address each account used.
UPDATE "User" u SET "address" = (
  SELECT s."pickupAddress" FROM "Shoe" s
  JOIN "Merchant" m ON m."id" = s."merchantId"
  WHERE m."userId" = u."id"
  ORDER BY s."createdAt" DESC LIMIT 1
) WHERE u."role" = 'MERCHANT';
UPDATE "User" u SET "address" = (
  SELECT r."deliveryAddress" FROM "Rental" r
  WHERE r."borrowerId" = u."id"
  ORDER BY r."createdAt" DESC LIMIT 1
) WHERE u."role" = 'BORROWER';

ALTER TABLE "Rental" DROP COLUMN "deliveryAddress";
ALTER TABLE "Shoe" DROP COLUMN "pickupAddress";
