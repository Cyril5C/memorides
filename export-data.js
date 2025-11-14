#!/usr/bin/env node

/**
 * Script d'export complet des données
 * - Exporte la base de données en JSON
 * - Copie tous les fichiers GPX et photos dans un dossier d'export
 * - Crée une archive ZIP du tout
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

const prisma = new PrismaClient();

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

async function copyDirectory(src, dest) {
    await ensureDir(dest);
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDirectory(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

async function exportData() {
    console.log('\n========================================');
    console.log('📦 EXPORT DES DONNÉES MEMORIDES');
    console.log('========================================\n');

    try {
        // 1. Créer le dossier d'export
        console.log(`📁 Création du dossier d'export: ${EXPORT_PATH}`);
        await ensureDir(EXPORT_PATH);

        // 2. Exporter la base de données
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

        const dbExport = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            tracks: tracks,
            labels: labels,
            photos: photos
        };

        const dbPath = path.join(EXPORT_PATH, 'database.json');
        await fs.writeFile(dbPath, JSON.stringify(dbExport, null, 2));
        console.log(`✅ Base de données exportée: ${tracks.length} traces, ${labels.length} labels, ${photos.length} photos`);

        // 3. Copier les fichiers GPX
        console.log('\n📄 Copie des fichiers GPX...');
        const gpxSrc = path.join(__dirname, 'uploads', 'gpx');
        const gpxDest = path.join(EXPORT_PATH, 'gpx');

        try {
            const gpxFiles = await fs.readdir(gpxSrc);
            if (gpxFiles.length > 0) {
                await copyDirectory(gpxSrc, gpxDest);
                console.log(`✅ ${gpxFiles.length} fichiers GPX copiés`);
            } else {
                console.log('⚠️  Aucun fichier GPX à copier');
            }
        } catch (error) {
            console.log('⚠️  Dossier GPX vide ou inexistant');
        }

        // 4. Copier les photos
        console.log('\n📸 Copie des photos...');
        const photosSrc = path.join(__dirname, 'uploads', 'photos');
        const photosDest = path.join(EXPORT_PATH, 'photos');

        try {
            const photoFiles = await fs.readdir(photosSrc);
            if (photoFiles.length > 0) {
                await copyDirectory(photosSrc, photosDest);
                console.log(`✅ ${photoFiles.length} photos copiées`);
            } else {
                console.log('⚠️  Aucune photo à copier');
            }
        } catch (error) {
            console.log('⚠️  Dossier photos vide ou inexistant');
        }

        // 5. Créer un fichier README
        console.log('\n📝 Création du README...');
        const readme = `# Memorides Backup - ${TIMESTAMP}

## Contenu de cette archive

- **database.json** : Export complet de la base de données
- **gpx/** : Tous les fichiers GPX de vos traces
- **photos/** : Toutes les photos associées aux traces

## Restauration

Pour restaurer ces données :

\`\`\`bash
node import-data.js ${EXPORT_NAME}
\`\`\`

Export créé le : ${new Date().toLocaleString('fr-FR')}
Nombre de traces : ${tracks.length}
Nombre de labels : ${labels.length}
Nombre de photos : ${photos.length}
`;
        await fs.writeFile(path.join(EXPORT_PATH, 'README.md'), readme);
        console.log('✅ README créé');

        // 6. Créer une archive ZIP (optionnel, si zip est disponible)
        console.log('\n🗜️  Création de l\'archive ZIP...');
        try {
            const zipPath = path.join(EXPORT_DIR, `${EXPORT_NAME}.zip`);
            execSync(`cd "${EXPORT_DIR}" && zip -r "${EXPORT_NAME}.zip" "${EXPORT_NAME}"`, { stdio: 'inherit' });
            console.log(`✅ Archive créée: ${zipPath}`);

            // Calculer la taille
            const stats = await fs.stat(zipPath);
            const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            console.log(`   Taille: ${sizeMB} MB`);
        } catch (error) {
            console.log('⚠️  Impossible de créer l\'archive ZIP (commande zip non disponible)');
            console.log(`   Les fichiers sont disponibles dans: ${EXPORT_PATH}`);
        }

        console.log('\n========================================');
        console.log('✅ EXPORT TERMINÉ AVEC SUCCÈS !');
        console.log('========================================\n');
        console.log(`📂 Dossier d'export: ${EXPORT_PATH}`);
        console.log(`📦 Archive ZIP: ${path.join(EXPORT_DIR, EXPORT_NAME + '.zip')}\n`);

    } catch (error) {
        console.error('\n❌ Erreur lors de l\'export:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

exportData();
