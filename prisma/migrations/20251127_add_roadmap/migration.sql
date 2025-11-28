-- Add roadmap column to Track table
-- Default value 'later' for new tracks
-- Existing tracks: set to 'done' if completedAt is not null, otherwise 'later'

-- Add column if it doesn't exist (using CREATE TABLE IF NOT EXISTS pattern)
-- This will fail silently if the column already exists
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "roadmap" TEXT NOT NULL DEFAULT 'later';

-- Update existing tracks: set roadmap based on completedAt
UPDATE "Track" SET "roadmap" = 'done' WHERE "completedAt" IS NOT NULL AND "roadmap" = 'later';

-- Create index on roadmap column (IF NOT EXISTS is supported in PostgreSQL 9.5+)
CREATE INDEX IF NOT EXISTS "Track_roadmap_idx" ON "Track"("roadmap");
