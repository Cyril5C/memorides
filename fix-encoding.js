#!/usr/bin/env node

/**
 * Script pour corriger l'encodage UTF-8 des noms de fichiers
 * - Détecte les fichiers avec double encodage UTF-8
 * - Les renomme correctement
 * - Met à jour la base de données
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');

const prisma = new PrismaClient();
const GPX_DIR = path.join(__dirname, 'uploads', 'gpx');
const PHOTOS_DIR = path.join(__dirname, 'uploads', 'photos');

// Fonction pour décoder le double encodage UTF-8
function fixDoubleEncoding(str) {
    try {
        // Convertir la chaîne en buffer en supposant que c'est du latin1
        const buffer = Buffer.from(str, 'latin1');
        // Décoder comme UTF-8
        return buffer.toString('utf8');
    } catch (error) {
        return str;
    }
}

async function fixGPXFiles() {
    console.log('\n🔧 Correction de l\'encodage des fichiers GPX...\n');

    try {
        // Lire tous les fichiers GPX
        const files = await fs.readdir(GPX_DIR);
        let fixed = 0;

        for (const filename of files) {
            const fixedFilename = fixDoubleEncoding(filename);

            if (fixedFilename !== filename) {
                console.log(`📄 ${filename}`);
                console.log(`   → ${fixedFilename}`);

                const oldPath = path.join(GPX_DIR, filename);
                const newPath = path.join(GPX_DIR, fixedFilename);

                // Renommer le fichier
                await fs.rename(oldPath, newPath);

                // Mettre à jour la base de données
                await prisma.track.updateMany({
                    where: { filename: filename },
                    data: { filename: fixedFilename }
                });

                fixed++;
            }
        }

        console.log(`\n✅ ${fixed} fichiers GPX corrigés\n`);
    } catch (error) {
        console.error('❌ Erreur:', error);
    }
}

async function fixPhotoFiles() {
    console.log('🔧 Correction de l\'encodage des photos...\n');

    try {
        const files = await fs.readdir(PHOTOS_DIR);
        let fixed = 0;

        for (const filename of files) {
            const fixedFilename = fixDoubleEncoding(filename);

            if (fixedFilename !== filename) {
                console.log(`📸 ${filename}`);
                console.log(`   → ${fixedFilename}`);

                const oldPath = path.join(PHOTOS_DIR, filename);
                const newPath = path.join(PHOTOS_DIR, fixedFilename);

                // Renommer le fichier
                await fs.rename(oldPath, newPath);

                // Mettre à jour la base de données
                await prisma.photo.updateMany({
                    where: { filename: filename },
                    data: { filename: fixedFilename }
                });

                fixed++;
            }
        }

        console.log(`\n✅ ${fixed} photos corrigées\n`);
    } catch (error) {
        console.error('❌ Erreur:', error);
    }
}

async function main() {
    console.log('========================================');
    console.log('🔧 CORRECTION ENCODAGE UTF-8');
    console.log('========================================');

    await fixGPXFiles();
    await fixPhotoFiles();

    console.log('========================================');
    console.log('✅ CORRECTION TERMINÉE');
    console.log('========================================\n');

    await prisma.$disconnect();
}

main();
