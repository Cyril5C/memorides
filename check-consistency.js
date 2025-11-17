#!/usr/bin/env node

/**
 * Script de vérification de cohérence
 * - Compare les fichiers GPX/photos avec la base de données
 * - Détecte les fichiers orphelins (fichiers sans DB)
 * - Détecte les entrées orphelines (DB sans fichiers)
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');

const prisma = new PrismaClient();

const gpxDir = path.join(__dirname, 'uploads', 'gpx');
const photosDir = path.join(__dirname, 'uploads', 'photos');

async function checkConsistency() {
    console.log('\n========================================');
    console.log('🔍 VÉRIFICATION DE COHÉRENCE');
    console.log('========================================\n');

    try {
        // 1. Lire tous les fichiers GPX
        console.log('📄 Vérification des fichiers GPX...');
        let gpxFiles = [];
        try {
            gpxFiles = await fs.readdir(gpxDir);
            console.log(`   Trouvé ${gpxFiles.length} fichiers GPX sur le disque`);
        } catch (error) {
            console.log('   ⚠️  Répertoire GPX vide ou inexistant');
        }

        // 2. Lire toutes les entrées Track de la DB
        const tracks = await prisma.track.findMany({
            select: {
                id: true,
                filename: true,
                name: true,
                title: true
            }
        });
        console.log(`   Trouvé ${tracks.length} tracks dans la base de données\n`);

        // 3. Vérifier les fichiers orphelins (fichiers sans DB)
        console.log('🔎 Recherche de fichiers orphelins...');
        const orphanedFiles = [];
        const dbFilenames = new Set(tracks.map(t => t.filename));

        for (const file of gpxFiles) {
            if (!dbFilenames.has(file)) {
                orphanedFiles.push(file);
            }
        }

        if (orphanedFiles.length > 0) {
            console.log(`   ❌ ${orphanedFiles.length} fichiers orphelins trouvés :`);
            orphanedFiles.forEach(file => {
                console.log(`      - ${file}`);
            });
        } else {
            console.log('   ✅ Aucun fichier orphelin\n');
        }

        // 4. Vérifier les entrées orphelines (DB sans fichiers)
        console.log('🔎 Recherche d\'entrées DB orphelines...');
        const orphanedEntries = [];
        const fileSet = new Set(gpxFiles);

        for (const track of tracks) {
            if (!fileSet.has(track.filename)) {
                orphanedEntries.push(track);
            }
        }

        if (orphanedEntries.length > 0) {
            console.log(`   ❌ ${orphanedEntries.length} entrées DB sans fichiers :`);
            orphanedEntries.forEach(track => {
                console.log(`      - ${track.filename}`);
                console.log(`        ID: ${track.id}`);
                console.log(`        Nom: ${track.title || track.name}`);
            });
        } else {
            console.log('   ✅ Aucune entrée DB orpheline\n');
        }

        // 5. Vérifier les photos
        console.log('📸 Vérification des photos...');
        let photoFiles = [];
        try {
            photoFiles = await fs.readdir(photosDir);
            console.log(`   Trouvé ${photoFiles.length} fichiers photos sur le disque`);
        } catch (error) {
            console.log('   ⚠️  Répertoire photos vide ou inexistant');
        }

        const photos = await prisma.photo.findMany({
            select: {
                id: true,
                filename: true,
                name: true
            }
        });
        console.log(`   Trouvé ${photos.length} photos dans la base de données\n`);

        // 6. Photos orphelines
        const orphanedPhotoFiles = [];
        const dbPhotoFilenames = new Set(photos.map(p => p.filename));

        for (const file of photoFiles) {
            if (!dbPhotoFilenames.has(file)) {
                orphanedPhotoFiles.push(file);
            }
        }

        if (orphanedPhotoFiles.length > 0) {
            console.log(`   ❌ ${orphanedPhotoFiles.length} fichiers photos orphelins`);
        } else {
            console.log('   ✅ Aucun fichier photo orphelin');
        }

        const orphanedPhotoEntries = [];
        const photoFileSet = new Set(photoFiles);

        for (const photo of photos) {
            if (!photoFileSet.has(photo.filename)) {
                orphanedPhotoEntries.push(photo);
            }
        }

        if (orphanedPhotoEntries.length > 0) {
            console.log(`   ❌ ${orphanedPhotoEntries.length} entrées photos DB sans fichiers`);
        } else {
            console.log('   ✅ Aucune entrée photo DB orpheline');
        }

        // 7. Résumé
        console.log('\n========================================');
        console.log('📊 RÉSUMÉ');
        console.log('========================================');
        console.log(`GPX:`);
        console.log(`  - Fichiers sur disque: ${gpxFiles.length}`);
        console.log(`  - Entrées en DB: ${tracks.length}`);
        console.log(`  - Fichiers orphelins: ${orphanedFiles.length}`);
        console.log(`  - Entrées DB orphelines: ${orphanedEntries.length}`);
        console.log(`\nPhotos:`);
        console.log(`  - Fichiers sur disque: ${photoFiles.length}`);
        console.log(`  - Entrées en DB: ${photos.length}`);
        console.log(`  - Fichiers orphelins: ${orphanedPhotoFiles.length}`);
        console.log(`  - Entrées DB orphelines: ${orphanedPhotoEntries.length}`);

        const totalIssues = orphanedFiles.length + orphanedEntries.length +
                          orphanedPhotoFiles.length + orphanedPhotoEntries.length;

        if (totalIssues === 0) {
            console.log('\n✅ TOUT EST COHÉRENT ! Aucun problème détecté.\n');
        } else {
            console.log(`\n⚠️  ${totalIssues} PROBLÈMES DÉTECTÉS\n`);

            // Suggestions de correction
            if (orphanedFiles.length > 0) {
                console.log('💡 Pour nettoyer les fichiers orphelins :');
                console.log('   Les fichiers existent mais pas en DB. Supprimez-les ou importez-les.\n');
            }

            if (orphanedEntries.length > 0) {
                console.log('💡 Pour corriger les entrées DB orphelines :');
                console.log('   La DB référence des fichiers qui n\'existent pas.');
                console.log('   Option 1: Supprimez les entrées avec:');
                console.log('   DELETE FROM "Track" WHERE filename IN (...);');
                console.log('   Option 2: Ré-uploadez les fichiers manquants.\n');
            }
        }

    } catch (error) {
        console.error('\n❌ Erreur lors de la vérification:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

checkConsistency();
