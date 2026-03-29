-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "bayCode" TEXT,
ADD COLUMN     "shelfLevel" INTEGER;

-- AlterTable
ALTER TABLE "SpaceTypeConfig" ADD COLUMN     "defaultMonthlyRate" DECIMAL(10,2),
ADD COLUMN     "dxfBlockPattern" TEXT,
ADD COLUMN     "membershipRequirement" TEXT;
