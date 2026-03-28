-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "flagNote" TEXT,
ADD COLUMN     "undoOfId" TEXT;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_undoOfId_fkey" FOREIGN KEY ("undoOfId") REFERENCES "AuditLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
