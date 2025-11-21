#!/usr/bin/env node

/**
 * Script d'export pour la production (PostgreSQL)
 * - Exporte uniquement la base de données en JSON
 * - Les fichiers (GPX et photos) doivent être téléchargés séparément depuis Railway
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const EXPORT_DIR = path.join(__dirname, 'exports');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
const EXPORT_NAME = `memorides-backup-${TIMESTAMP}`;
const EXPORT_PATH = path.join(EXPORT_DIR, EXPORT_NAME);

async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
}

async function exportData() {
    console.log('\n========================================');
    console.log('📦 EXPORT DES DONNÉES PRODUCTION');
    console.log('========================================\n');

    let prisma;

    try {
        // 1. Générer le client Prisma pour PostgreSQL
        console.log('🔧 Génération du client Prisma pour PostgreSQL...');
        execSync('npx prisma generate --schema=./prisma/schema.production.prisma', {
            stdio: 'inherit',
            env: process.env
        });

        // 2. Importer le client Prisma généré
        const clientPath = path.join(__dirname, 'node_modules', '.prisma', 'client-prod');
        const { PrismaClient } = require(clientPath);
        prisma = new PrismaClient();

        // 3. Créer le dossier d'export
        console.log(`\n📁 Création du dossier d'export: ${EXPORT_PATH}`);
        await ensureDir(EXPORT_PATH);

        // 4. Exporter la base de données
        console.log('\n📊 Export de la base de données...');

        const tracks = await prisma.track.findMany({
            include: {
                photos: true,
                labels: {
                    include: {
                        label: true
                    }
                }
            }
        });

        const labels = await prisma.label.findMany();
        const photos = await prisma.photo.findMany();
        const trackTypes = await prisma.trackType.findMany();

        const dbExport = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            tracks: tracks,
            labels: labels,
            photos: photos,
            trackTypes: trackTypes
        };

        const dbPath = path.join(EXPORT_PATH, 'database.json');
        await fs.writeFile(dbPath, JSON.stringify(dbExport, null, 2));
        console.log(`✅ Base de données exportée: ${tracks.length} traces, ${labels.length} labels, ${photos.length} photos, ${trackTypes.length} types`);

        // 5. Créer un fichier README
        console.log('\n📝 Création du README...');
        const readme = `# Memorides Backup - ${TIMESTAMP}

## Contenu de cette archive

- **database.json** : Export complet de la base de données

## Fichiers manquants

⚠️ Les fichiers GPX et photos ne sont pas inclus dans cet export.
Vous devez les télécharger séparément depuis Railway :

\`\`\`bash
# Télécharger les volumes depuis Railway
railway volumes
\`\`\`

## Restauration

Pour restaurer ces données en local :

\`\`\`bash
node import-data.js ${EXPORT_NAME}
\`\`\`

Export créé le : ${new Date().toLocaleString('fr-FR')}
Nombre de traces : ${tracks.length}
Nombre de labels : ${labels.length}
Nombre de photos : ${photos.length}
Nombre de types : ${trackTypes.length}
`;
        await fs.writeFile(path.join(EXPORT_PATH, 'README.md'), readme);
        console.log('✅ README créé');

        console.log('\n========================================');
        console.log('✅ EXPORT TERMINÉ AVEC SUCCÈS !');
        console.log('========================================\n');
        console.log(`📂 Dossier d'export: ${EXPORT_PATH}`);
        console.log(`📄 Fichier JSON: ${dbPath}\n`);
        console.log('⚠️  N\'oubliez pas de télécharger les fichiers GPX et photos depuis Railway !');

    } catch (error) {
        console.error('\n❌ Erreur lors de l\'export:', error);
        process.exit(1);
    } finally {
        if (prisma) {
            await prisma.$disconnect();
        }
    }
}

exportData();
