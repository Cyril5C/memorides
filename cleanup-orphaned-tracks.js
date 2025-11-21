#!/usr/bin/env node

/**
 * Script pour nettoyer les traces orphelines
 * - Supprime les traces de la DB dont les fichiers GPX n'existent plus
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');

const prisma = new PrismaClient();
const GPX_DIR = path.join(__dirname, 'uploads', 'gpx');

async function cleanupOrphanedTracks() {
    console.log('\n========================================');
    console.log('🧹 NETTOYAGE DES TRACES ORPHELINES');
    console.log('========================================\n');

    try {
        // Récupérer toutes les traces
        const tracks = await prisma.track.findMany({
            select: {
                id: true,
                filename: true,
                name: true
            }
        });

        console.log(`📊 ${tracks.length} traces dans la base de données\n`);

        let deleted = 0;
        let kept = 0;

        for (const track of tracks) {
            const filePath = path.join(GPX_DIR, track.filename);

            try {
                await fs.access(filePath);
                // Le fichier existe
                kept++;
            } catch (error) {
                // Le fichier n'existe pas
                console.log(`🗑️  Suppression: ${track.name || track.filename}`);
                console.log(`   ID: ${track.id}`);
                console.log(`   Fichier manquant: ${track.filename}\n`);

                // Supprimer la trace de la DB
                await prisma.track.delete({
                    where: { id: track.id }
                });

                deleted++;
            }
        }

        console.log('========================================');
        console.log(`✅ ${kept} traces conservées`);
        console.log(`🗑️  ${deleted} traces orphelines supprimées`);
        console.log('========================================\n');

    } catch (error) {
        console.error('❌ Erreur:', error);
    } finally {
        await prisma.$disconnect();
    }
}

cleanupOrphanedTracks();
