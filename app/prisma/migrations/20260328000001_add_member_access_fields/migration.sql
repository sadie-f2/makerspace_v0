-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "accessSuspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accessSuspendedAt" TIMESTAMP(3);
