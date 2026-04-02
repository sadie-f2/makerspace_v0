-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "emailConfirmCode" TEXT,
ADD COLUMN     "emailConfirmExpiresAt" TIMESTAMP(3);
