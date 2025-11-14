#!/usr/bin/env node

/**
 * Script de nettoyage complet de la production
 * - Vide toutes les tables de la base de données
 * - Supprime tous les fichiers GPX et photos
 *
 * ATTENTION : Cette action est irréversible !
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');

const prisma = new PrismaClient();

async function deleteAllFiles(directory) {
    try {
        const files = await fs.readdir(directory);
        console.log(`📂 Trouvé ${files.length} fichiers dans ${directory}`);

        for (const file of files) {
            const filePath = path.join(directory, file);
            await fs.unlink(filePath);
            console.log(`   ✅ Supprimé: ${file}`);
        }

        console.log(`✅ Tous les fichiers de ${directory} ont été supprimés\n`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`⚠️  Le répertoire ${directory} n'existe pas\n`);
        } else {
            console.error(`❌ Erreur lors de la suppression des fichiers de ${directory}:`, error.message);
        }
    }
}

async function cleanup() {
    console.log('\n========================================');
    console.log('🧹 NETTOYAGE COMPLET DE LA PRODUCTION');
    console.log('========================================\n');

    try {
        // 1. Supprimer toutes les associations track-label
        console.log('📊 Suppression des associations track-label...');
        const deletedTrackLabels = await prisma.trackLabel.deleteMany();
        console.log(`✅ ${deletedTrackLabels.count} associations supprimées\n`);

        // 2. Supprimer toutes les photos
        console.log('📊 Suppression des photos de la base de données...');
        const deletedPhotos = await prisma.photo.deleteMany();
        console.log(`✅ ${deletedPhotos.count} photos supprimées de la DB\n`);

        // 3. Supprimer tous les tracks
        console.log('📊 Suppression des tracks...');
        const deletedTracks = await prisma.track.deleteMany();
        console.log(`✅ ${deletedTracks.count} tracks supprimés\n`);

        // 4. Supprimer tous les labels
        console.log('📊 Suppression des labels...');
        const deletedLabels = await prisma.label.deleteMany();
        console.log(`✅ ${deletedLabels.count} labels supprimés\n`);

        // 5. Supprimer tous les fichiers GPX
        console.log('📁 Suppression des fichiers GPX...');
        await deleteAllFiles(path.join(__dirname, 'uploads', 'gpx'));

        // 6. Supprimer tous les fichiers photos
        console.log('📁 Suppression des fichiers photos...');
        await deleteAllFiles(path.join(__dirname, 'uploads', 'photos'));

        console.log('========================================');
        console.log('✅ NETTOYAGE TERMINÉ AVEC SUCCÈS !');
        console.log('========================================\n');
        console.log('La base de données et les répertoires sont maintenant vides.');
        console.log('Vous pouvez uploader de nouvelles traces.\n');

    } catch (error) {
        console.error('\n❌ Erreur lors du nettoyage:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Demander confirmation
console.log('\n⚠️  ATTENTION : Ce script va supprimer TOUTES les données !');
console.log('   - Tous les tracks');
console.log('   - Tous les labels');
console.log('   - Toutes les photos');
console.log('   - Tous les fichiers GPX et photos\n');

const args = process.argv.slice(2);
if (args.includes('--confirm')) {
    cleanup();
} else {
    console.log('Pour exécuter ce script, utilisez :');
    console.log('  node cleanup-production.js --confirm\n');
    process.exit(0);
}
