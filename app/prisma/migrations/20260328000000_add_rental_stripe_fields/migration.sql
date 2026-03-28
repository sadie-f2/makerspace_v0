-- AlterTable
ALTER TABLE "Rental" ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "stripeSubscriptionStatus" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Rental_stripeSubscriptionId_key" ON "Rental"("stripeSubscriptionId");
