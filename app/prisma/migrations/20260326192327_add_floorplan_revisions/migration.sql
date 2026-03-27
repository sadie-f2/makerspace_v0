-- CreateTable
CREATE TABLE "FloorPlanRevision" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "svgPath" TEXT NOT NULL,
    "note" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,

    CONSTRAINT "FloorPlanRevision_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FloorPlanRevision" ADD CONSTRAINT "FloorPlanRevision_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
