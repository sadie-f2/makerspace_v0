-- CreateEnum
CREATE TYPE "LeaseRequestType" AS ENUM ('START', 'END');

-- CreateEnum
CREATE TYPE "LeaseRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'ACCEPTED', 'WITHDRAWN');

-- AlterEnum
ALTER TYPE "MemberRole" ADD VALUE 'VOLUNTEER';

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "outOfService" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "outOfServiceAt" TIMESTAMP(3),
ADD COLUMN     "outOfServiceNote" TEXT;

-- CreateTable
CREATE TABLE "MemberPermission" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "MemberPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseRequest" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "requestType" "LeaseRequestType" NOT NULL,
    "requestedStartDate" TIMESTAMP(3),
    "requestedMonthlyRate" DECIMAL(10,2),
    "leaseId" TEXT,
    "status" "LeaseRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "resourceTypeTag" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "note" TEXT,
    "offeredResourceId" TEXT,
    "offeredAt" TIMESTAMP(3),

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberPermission_memberId_permission_key" ON "MemberPermission"("memberId", "permission");

-- AddForeignKey
ALTER TABLE "MemberPermission" ADD CONSTRAINT "MemberPermission_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPermission" ADD CONSTRAINT "MemberPermission_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseRequest" ADD CONSTRAINT "LeaseRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseRequest" ADD CONSTRAINT "LeaseRequest_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseRequest" ADD CONSTRAINT "LeaseRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseRequest" ADD CONSTRAINT "LeaseRequest_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_offeredResourceId_fkey" FOREIGN KEY ("offeredResourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
