-- Add roadmap column to Track table
-- Default value 'later' for new tracks
-- Existing tracks: set to 'done' if completedAt is not null, otherwise 'later'

-- PostgreSQL: Add column only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='Track' AND column_name='roadmap'
    ) THEN
        ALTER TABLE "Track" ADD COLUMN "roadmap" TEXT NOT NULL DEFAULT 'later';
    END IF;
END $$;

-- Update existing tracks: set roadmap based on completedAt
UPDATE "Track" SET "roadmap" = 'done' WHERE "completedAt" IS NOT NULL AND "roadmap" = 'later';

-- Create index on roadmap column (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'Track' AND indexname = 'Track_roadmap_idx'
    ) THEN
        CREATE INDEX "Track_roadmap_idx" ON "Track"("roadmap");
    END IF;
END $$;
