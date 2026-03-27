-- Rename enum: LeaseRequestType -> RentalRequestType
ALTER TYPE "LeaseRequestType" RENAME TO "RentalRequestType";

-- Rename enum: LeaseRequestStatus -> RentalRequestStatus
ALTER TYPE "LeaseRequestStatus" RENAME TO "RentalRequestStatus";

-- Rename enum: LeaseAccessScope -> RentalAccessScope
ALTER TYPE "LeaseAccessScope" RENAME TO "RentalAccessScope";

-- Rename column: Resource.leaseAccessScope -> Resource.rentalAccessScope
ALTER TABLE "Resource" RENAME COLUMN "leaseAccessScope" TO "rentalAccessScope";

-- Rename table: Lease -> Rental
ALTER TABLE "Lease" RENAME TO "Rental";

-- Rename primary key constraint on Rental
ALTER TABLE "Rental" RENAME CONSTRAINT "Lease_pkey" TO "Rental_pkey";

-- Rename table: LeaseRequest -> RentalRequest
ALTER TABLE "LeaseRequest" RENAME TO "RentalRequest";

-- Rename primary key constraint on RentalRequest
ALTER TABLE "RentalRequest" RENAME CONSTRAINT "LeaseRequest_pkey" TO "RentalRequest_pkey";

-- Rename column: RentalRequest.leaseId -> RentalRequest.rentalId
ALTER TABLE "RentalRequest" RENAME COLUMN "leaseId" TO "rentalId";

-- Drop old foreign keys on Rental (from Member and Resource)
ALTER TABLE "Rental" DROP CONSTRAINT "Lease_memberId_fkey";
ALTER TABLE "Rental" DROP CONSTRAINT "Lease_resourceId_fkey";

-- Re-add foreign keys with new names
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop old foreign keys on RentalRequest
ALTER TABLE "RentalRequest" DROP CONSTRAINT "LeaseRequest_memberId_fkey";
ALTER TABLE "RentalRequest" DROP CONSTRAINT "LeaseRequest_resourceId_fkey";
ALTER TABLE "RentalRequest" DROP CONSTRAINT "LeaseRequest_reviewedById_fkey";
ALTER TABLE "RentalRequest" DROP CONSTRAINT "LeaseRequest_leaseId_fkey";

-- Re-add foreign keys on RentalRequest with new names
ALTER TABLE "RentalRequest" ADD CONSTRAINT "RentalRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequest" ADD CONSTRAINT "RentalRequest_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalRequest" ADD CONSTRAINT "RentalRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RentalRequest" ADD CONSTRAINT "RentalRequest_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE SET NULL ON UPDATE CASCADE;
