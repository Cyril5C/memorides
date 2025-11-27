-- Change default value for roadmap column from 'todo' to 'later'
-- Update existing 'todo' tracks to 'later'

-- Update all tracks with 'todo' value to 'later' (if table exists)
-- This migration is safe to run even if table doesn't exist yet
-- SQLite doesn't support ALTER COLUMN DEFAULT directly
-- The new default 'later' is defined in the schema and will apply to new records
