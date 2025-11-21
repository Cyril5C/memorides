#!/usr/bin/env node

/**
 * Script de synchronisation depuis la production
 * - Télécharge le backup depuis l'API de production
 * - Écrase la base de données locale
 * - Écrase les fichiers GPX locaux
 * - NE TOUCHE PAS aux photos locales
 */

const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

const PROD_URL = 'https://memorides-production.up.railway.app';
const EXPORT_DIR = path.join(__dirname, 'exports');
const TIMESTAMP = new Date().toISOString().split('T')[0];
const BACKUP_ZIP = path.join(EXPORT_DIR, `prod-sync-${TIMESTAMP}.zip`);
const BACKUP_DIR = path.join(EXPORT_DIR, `prod-sync-${TIMESTAMP}`);
const DB_PATH = path.join(__dirname, 'prisma', 'prisma', 'dev.db');
const GPX_DIR = path.join(__dirname, 'uploads', 'gpx');

async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
}

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = require('fs').createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;

            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
                process.stdout.write(`\r   Progression: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(2)} MB / ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
            });

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log('\n');
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest);
            reject(err);
        });
    });
}

async function syncFromProd() {
    console.log('\n========================================');
    console.log('🔄 SYNCHRONISATION DEPUIS LA PRODUCTION');
    console.log('========================================\n');

    try {
        // 1. Créer le dossier d'export
        console.log('📁 Création du dossier d\'export...');
        await ensureDir(EXPORT_DIR);

        // 2. Télécharger le backup depuis la production
        console.log('\n📥 Téléchargement du backup depuis la production...');
        console.log(`   URL: ${PROD_URL}/api/export/backup`);
        await downloadFile(`${PROD_URL}/api/export/backup`, BACKUP_ZIP);

        const stats = await fs.stat(BACKUP_ZIP);
        console.log(`✅ Backup téléchargé: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        // 3. Extraire l'archive
        console.log('\n📦 Extraction de l\'archive...');
        await ensureDir(BACKUP_DIR);
        execSync(`unzip -o "${BACKUP_ZIP}" -d "${BACKUP_DIR}"`, { stdio: 'inherit' });
        console.log('✅ Archive extraite');

        // 4. Vérifier les fichiers extraits
        const dbSqlPath = path.join(BACKUP_DIR, 'database', 'backup.sql');
        const gpxBackupDir = path.join(BACKUP_DIR, 'gpx');

        const dbSqlExists = await fs.access(dbSqlPath).then(() => true).catch(() => false);
        const gpxDirExists = await fs.access(gpxBackupDir).then(() => true).catch(() => false);

        if (!dbSqlExists) {
            throw new Error('Fichier database/backup.sql introuvable dans le backup');
        }

        // 5. Importer la base de données
        console.log('\n🗄️  Import de la base de données...');
        console.log(`   Cible: ${DB_PATH}`);

        // Vérifier que la base existe
        const dbExists = await fs.access(DB_PATH).then(() => true).catch(() => false);
        if (!dbExists) {
            throw new Error('Base de données locale introuvable. Lancez d\'abord le serveur local pour créer la base.');
        }

        execSync(`sqlite3 "${DB_PATH}" < "${dbSqlPath}"`, { stdio: 'inherit' });

        // Vérifier l'import
        const trackCount = execSync(`sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM Track;"`, { encoding: 'utf8' }).trim();
        console.log(`✅ Base de données importée: ${trackCount} traces`);

        // 6. Copier les fichiers GPX
        console.log('\n📄 Synchronisation des fichiers GPX...');

        if (gpxDirExists) {
            // Vider le dossier GPX local
            console.log('   Suppression des GPX locaux...');
            await fs.rm(GPX_DIR, { recursive: true, force: true });
            await ensureDir(GPX_DIR);

            // Copier les nouveaux GPX
            console.log('   Copie des GPX de production...');
            const gpxFiles = await fs.readdir(gpxBackupDir);
            for (const file of gpxFiles) {
                await fs.copyFile(
                    path.join(gpxBackupDir, file),
                    path.join(GPX_DIR, file)
                );
            }
            console.log(`✅ ${gpxFiles.length} fichiers GPX synchronisés`);
        } else {
            console.log('⚠️  Aucun fichier GPX dans le backup');
        }

        // 7. Nettoyer
        console.log('\n🧹 Nettoyage...');
        await fs.rm(BACKUP_ZIP);
        await fs.rm(BACKUP_DIR, { recursive: true });
        console.log('✅ Fichiers temporaires supprimés');

        console.log('\n========================================');
        console.log('✅ SYNCHRONISATION TERMINÉE !');
        console.log('========================================\n');
        console.log('📊 Base de données: écrasée');
        console.log('📄 Fichiers GPX: écrasés');
        console.log('📸 Photos: conservées (non modifiées)\n');

    } catch (error) {
        console.error('\n❌ Erreur lors de la synchronisation:', error.message);
        process.exit(1);
    }
}

syncFromProd();
