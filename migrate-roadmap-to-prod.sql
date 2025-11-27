-- Migration PostgreSQL pour ajouter la colonne roadmap et mettre à jour les données
-- À exécuter manuellement sur Railway

BEGIN;

-- 1. Ajouter la colonne roadmap si elle n'existe pas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='Track' AND column_name='roadmap'
    ) THEN
        ALTER TABLE "Track" ADD COLUMN "roadmap" TEXT NOT NULL DEFAULT 'later';
        RAISE NOTICE 'Colonne roadmap ajoutée avec succès';
    ELSE
        RAISE NOTICE 'La colonne roadmap existe déjà';
    END IF;
END $$;

-- 2. Mettre à jour les traces existantes : 'done' si completedAt n'est pas null
UPDATE "Track"
SET "roadmap" = 'done'
WHERE "completedAt" IS NOT NULL AND "roadmap" = 'later';

-- 3. Créer l'index sur roadmap si il n'existe pas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'Track' AND indexname = 'Track_roadmap_idx'
    ) THEN
        CREATE INDEX "Track_roadmap_idx" ON "Track"("roadmap");
        RAISE NOTICE 'Index Track_roadmap_idx créé avec succès';
    ELSE
        RAISE NOTICE 'L''index Track_roadmap_idx existe déjà';
    END IF;
END $$;

COMMIT;

-- Vérification
SELECT
    roadmap,
    COUNT(*) as count,
    COUNT(CASE WHEN "completedAt" IS NOT NULL THEN 1 END) as completed_count
FROM "Track"
GROUP BY roadmap
ORDER BY roadmap;
