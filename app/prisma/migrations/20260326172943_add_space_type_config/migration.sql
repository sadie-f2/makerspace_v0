-- CreateTable
CREATE TABLE "SpaceTypeConfig" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "parentId" TEXT,
    "dxfLayer" TEXT,
    "color" TEXT,
    "isBookable" BOOLEAN NOT NULL DEFAULT false,
    "isLeasable" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpaceTypeConfig_slug_key" ON "SpaceTypeConfig"("slug");

-- AddForeignKey
ALTER TABLE "SpaceTypeConfig" ADD CONSTRAINT "SpaceTypeConfig_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SpaceTypeConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
