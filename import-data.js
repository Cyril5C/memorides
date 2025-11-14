#!/usr/bin/env node

/**
 * Script d'import complet des données
 * - Importe la base de données depuis un fichier JSON
 * - Copie tous les fichiers GPX et photos
 * - Restaure l'état exact de l'export
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');

const prisma = new PrismaClient();

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

    let count = 0;
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            count += await copyDirectory(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
            count++;
        }
    }
    return count;
}

async function importData(importPath) {
    console.log('\n========================================');
    console.log('📥 IMPORT DES DONNÉES MEMORIDES');
    console.log('========================================\n');

    try {
        // 1. Vérifier que le dossier d'import existe
        console.log(`📂 Vérification du dossier: ${importPath}`);
        try {
            await fs.access(importPath);
        } catch {
            throw new Error(`Le dossier d'import n'existe pas: ${importPath}`);
        }

        // 2. Lire le fichier de base de données
        console.log('\n📊 Lecture de la base de données...');
        const dbPath = path.join(importPath, 'database.json');
        const dbContent = await fs.readFile(dbPath, 'utf-8');
        const data = JSON.parse(dbContent);

        console.log(`✅ Export trouvé:`);
        console.log(`   - Version: ${data.version}`);
        console.log(`   - Date: ${new Date(data.exportDate).toLocaleString('fr-FR')}`);
        console.log(`   - ${data.tracks.length} traces`);
        console.log(`   - ${data.labels.length} labels`);
        console.log(`   - ${data.photos.length} photos`);

        // 3. Demander confirmation
        console.log('\n⚠️  ATTENTION : Cet import va :');
        console.log('   - Supprimer toutes les données actuelles');
        console.log('   - Les remplacer par les données importées');
        console.log('   - Copier tous les fichiers GPX et photos\n');

        // 4. Nettoyer la base de données actuelle
        console.log('🧹 Nettoyage de la base de données actuelle...');
        await prisma.trackLabel.deleteMany();
        await prisma.photo.deleteMany();
        await prisma.track.deleteMany();
        await prisma.label.deleteMany();
        console.log('✅ Base de données nettoyée');

        // 5. Importer les labels
        console.log('\n📝 Import des labels...');
        for (const label of data.labels) {
            await prisma.label.create({
                data: {
                    id: label.id,
                    name: label.name,
                    createdAt: new Date(label.createdAt)
                }
            });
        }
        console.log(`✅ ${data.labels.length} labels importés`);

        // 6. Importer les tracks
        console.log('\n🗺️  Import des traces...');
        for (const track of data.tracks) {
            await prisma.track.create({
                data: {
                    id: track.id,
                    filename: track.filename,
                    name: track.name,
                    title: track.title,
                    comments: track.comments,
                    type: track.type,
                    direction: track.direction,
                    color: track.color,
                    distance: track.distance,
                    elevation: track.elevation,
                    duration: track.duration,
                    completedAt: track.completedAt ? new Date(track.completedAt) : null,
                    createdAt: new Date(track.createdAt),
                    updatedAt: new Date(track.updatedAt)
                }
            });
        }
        console.log(`✅ ${data.tracks.length} traces importées`);

        // 7. Importer les associations track-label
        console.log('\n🔗 Import des associations track-label...');
        let labelCount = 0;
        for (const track of data.tracks) {
            if (track.labels && track.labels.length > 0) {
                for (const trackLabel of track.labels) {
                    await prisma.trackLabel.create({
                        data: {
                            id: trackLabel.id,
                            trackId: trackLabel.trackId,
                            labelId: trackLabel.labelId,
                            createdAt: new Date(trackLabel.createdAt)
                        }
                    });
                    labelCount++;
                }
            }
        }
        console.log(`✅ ${labelCount} associations importées`);

        // 8. Importer les photos
        console.log('\n📸 Import des photos...');
        for (const photo of data.photos) {
            await prisma.photo.create({
                data: {
                    id: photo.id,
                    filename: photo.filename,
                    name: photo.name,
                    path: photo.path,
                    latitude: photo.latitude,
                    longitude: photo.longitude,
                    createdAt: new Date(photo.createdAt),
                    trackId: photo.trackId
                }
            });
        }
        console.log(`✅ ${data.photos.length} photos importées`);

        // 9. Copier les fichiers GPX
        console.log('\n📄 Copie des fichiers GPX...');
        const gpxSrc = path.join(importPath, 'gpx');
        const gpxDest = path.join(__dirname, 'uploads', 'gpx');

        try {
            await ensureDir(gpxDest);
            const gpxCount = await copyDirectory(gpxSrc, gpxDest);
            console.log(`✅ ${gpxCount} fichiers GPX copiés`);
        } catch (error) {
            console.log('⚠️  Aucun fichier GPX à copier');
        }

        // 10. Copier les fichiers photos
        console.log('\n🖼️  Copie des fichiers photos...');
        const photosSrc = path.join(importPath, 'photos');
        const photosDest = path.join(__dirname, 'uploads', 'photos');

        try {
            await ensureDir(photosDest);
            const photoCount = await copyDirectory(photosSrc, photosDest);
            console.log(`✅ ${photoCount} fichiers photos copiés`);
        } catch (error) {
            console.log('⚠️  Aucune photo à copier');
        }

        console.log('\n========================================');
        console.log('✅ IMPORT TERMINÉ AVEC SUCCÈS !');
        console.log('========================================\n');
        console.log('Les données ont été restaurées.');
        console.log('Rafraîchissez l\'application pour voir les changements.\n');

    } catch (error) {
        console.error('\n❌ Erreur lors de l\'import:', error);
        console.error('\nLa base de données peut être dans un état incohérent.');
        console.error('Vous pouvez réessayer l\'import ou utiliser cleanup-production.js\n');
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Récupérer le chemin depuis les arguments
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('\n❌ Usage: node import-data.js <chemin-du-dossier-export>\n');
    console.log('Exemples:');
    console.log('  node import-data.js exports/memorides-backup-2025-11-14');
    console.log('  node import-data.js ./my-backup\n');
    process.exit(1);
}

const importPath = path.resolve(args[0]);
importData(importPath);
