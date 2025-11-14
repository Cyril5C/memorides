-- AlterTable: Replace completed boolean with completedAt datetime
-- Step 1: Add new column
ALTER TABLE "Track" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Step 2: Migrate data (if completed was true, set completedAt to updatedAt)
UPDATE "Track" SET "completedAt" = "updatedAt" WHERE "completed" = true;

-- Step 3: Drop old column and index
DROP INDEX "Track_completed_idx";
ALTER TABLE "Track" DROP COLUMN "completed";

-- Step 4: Create new index
CREATE INDEX "Track_completedAt_idx" ON "Track"("completedAt");
