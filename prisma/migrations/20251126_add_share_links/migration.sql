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
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");

DROP INDEX IF EXISTS "ShareLink_token_idx";
CREATE INDEX "ShareLink_token_idx" ON "ShareLink"("token");

DROP INDEX IF EXISTS "ShareLink_trackId_idx";
CREATE INDEX "ShareLink_trackId_idx" ON "ShareLink"("trackId");

DROP INDEX IF EXISTS "ShareLink_expiresAt_idx";
CREATE INDEX "ShareLink_expiresAt_idx" ON "ShareLink"("expiresAt");

DROP INDEX IF EXISTS "ShareLink_active_idx";
CREATE INDEX "ShareLink_active_idx" ON "ShareLink"("active");

-- AddForeignKey (use DO block to check if constraint exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ShareLink_trackId_fkey'
    ) THEN
        ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_trackId_fkey"
        FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
