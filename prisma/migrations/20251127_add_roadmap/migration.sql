-- Add roadmap column to Track table
-- Default value 'todo' for new tracks
-- Existing tracks: set to 'done' if completedAt is not null, otherwise 'todo'

ALTER TABLE "Track" ADD COLUMN "roadmap" TEXT NOT NULL DEFAULT 'todo';

-- Update existing tracks: set roadmap based on completedAt
UPDATE "Track" SET "roadmap" = 'done' WHERE "completedAt" IS NOT NULL;

-- Create index on roadmap column
CREATE INDEX "Track_roadmap_idx" ON "Track"("roadmap");
