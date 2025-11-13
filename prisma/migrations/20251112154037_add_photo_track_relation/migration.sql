-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trackId" TEXT,
    CONSTRAINT "Photo_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Photo" ("createdAt", "filename", "id", "latitude", "longitude", "name", "path") SELECT "createdAt", "filename", "id", "latitude", "longitude", "name", "path" FROM "Photo";
DROP TABLE "Photo";
ALTER TABLE "new_Photo" RENAME TO "Photo";
CREATE UNIQUE INDEX "Photo_filename_key" ON "Photo"("filename");
CREATE INDEX "Photo_createdAt_idx" ON "Photo"("createdAt");
CREATE INDEX "Photo_trackId_idx" ON "Photo"("trackId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
