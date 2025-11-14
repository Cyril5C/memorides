-- AlterTable
ALTER TABLE "Track" ADD COLUMN "completed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Track_completed_idx" ON "Track"("completed");
