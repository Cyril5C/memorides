-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TrackLabel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrackLabel_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrackLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Label_name_key" ON "Label"("name");

-- CreateIndex
CREATE INDEX "Label_name_idx" ON "Label"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TrackLabel_trackId_labelId_key" ON "TrackLabel"("trackId", "labelId");

-- CreateIndex
CREATE INDEX "TrackLabel_trackId_idx" ON "TrackLabel"("trackId");

-- CreateIndex
CREATE INDEX "TrackLabel_labelId_idx" ON "TrackLabel"("labelId");

-- Migrate existing labels data
-- Note: SQLite doesn't support dynamic SQL, so we'll drop the column after migrating
-- The application will need to handle the migration of existing label data

-- Drop the old labels column (after migrating data through the application)
-- This will be done after we migrate the data in the application
