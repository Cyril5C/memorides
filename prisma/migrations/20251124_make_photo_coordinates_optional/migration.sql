-- Make latitude and longitude optional for photos
-- This allows uploading photos without GPS data

-- AlterTable
ALTER TABLE "Photo" ALTER COLUMN "latitude" DROP NOT NULL;
ALTER TABLE "Photo" ALTER COLUMN "longitude" DROP NOT NULL;
