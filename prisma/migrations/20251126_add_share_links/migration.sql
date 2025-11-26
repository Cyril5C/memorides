-- CreateTable (only if not exists)
CREATE TABLE IF NOT EXISTS "ShareLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (drop first if exists to avoid errors)
DROP INDEX IF EXISTS "ShareLink_token_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ShareLink_token_key" ON "ShareLink"("token");

DROP INDEX IF EXISTS "ShareLink_token_idx";
CREATE INDEX IF NOT EXISTS "ShareLink_token_idx" ON "ShareLink"("token");

DROP INDEX IF EXISTS "ShareLink_trackId_idx";
CREATE INDEX IF NOT EXISTS "ShareLink_trackId_idx" ON "ShareLink"("trackId");

DROP INDEX IF EXISTS "ShareLink_expiresAt_idx";
CREATE INDEX IF NOT EXISTS "ShareLink_expiresAt_idx" ON "ShareLink"("expiresAt");

DROP INDEX IF EXISTS "ShareLink_active_idx";
CREATE INDEX IF NOT EXISTS "ShareLink_active_idx" ON "ShareLink"("active");
