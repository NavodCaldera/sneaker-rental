-- Style packs (product owner, 2026-10-13): merchants and admins curate rotations of listed
-- pairs; merchant packs need an admin's approval before they are published.
-- CreateEnum
CREATE TYPE "StylePackStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PUBLISHED', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'STYLE_PACK';

-- CreateTable
CREATE TABLE "StylePack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "highlight" TEXT NOT NULL DEFAULT '',
    "status" "StylePackStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewNote" TEXT,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StylePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StylePackRole" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "experience" TEXT,

    CONSTRAINT "StylePackRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StylePackRoleShoe" (
    "roleId" TEXT NOT NULL,
    "shoeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "StylePackRoleShoe_pkey" PRIMARY KEY ("roleId","shoeId")
);

-- CreateIndex
CREATE INDEX "StylePack_status_publishedAt_idx" ON "StylePack"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "StylePack_createdById_idx" ON "StylePack"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "StylePackRole_packId_position_key" ON "StylePackRole"("packId", "position");

-- CreateIndex
CREATE INDEX "StylePackRoleShoe_shoeId_idx" ON "StylePackRoleShoe"("shoeId");

-- AddForeignKey
ALTER TABLE "StylePack" ADD CONSTRAINT "StylePack_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylePack" ADD CONSTRAINT "StylePack_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylePackRole" ADD CONSTRAINT "StylePackRole_packId_fkey" FOREIGN KEY ("packId") REFERENCES "StylePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylePackRoleShoe" ADD CONSTRAINT "StylePackRoleShoe_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "StylePackRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StylePackRoleShoe" ADD CONSTRAINT "StylePackRoleShoe_shoeId_fkey" FOREIGN KEY ("shoeId") REFERENCES "Shoe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

