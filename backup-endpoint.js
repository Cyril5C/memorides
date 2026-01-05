/**
 * Endpoint API pour déclencher un backup depuis GitHub Actions
 * Usage: POST /api/backup avec header Authorization: Bearer <BACKUP_TOKEN>
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');

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

async function createBackup() {
    const EXPORT_DIR = path.join(__dirname, 'exports');
    const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const EXPORT_NAME = `memorides-backup-${TIMESTAMP}`;
    const EXPORT_PATH = path.join(EXPORT_DIR, EXPORT_NAME);

    console.log('📦 Starting backup creation...');
    console.log(`📁 Export path: ${EXPORT_PATH}`);

    await ensureDir(EXPORT_PATH);

    // Export database
    console.log('📊 Exporting database...');
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
        tracks,
        labels,
        photos,
        trackTypes
    };

    await fs.writeFile(
        path.join(EXPORT_PATH, 'database.json'),
        JSON.stringify(dbExport, null, 2)
    );
    console.log(`✅ Database exported: ${tracks.length} tracks, ${labels.length} labels, ${photos.length} photos`);

    // Copy GPX files
    console.log('📄 Copying GPX files...');
    const gpxSrc = path.join(__dirname, 'uploads', 'gpx');
    const gpxDest = path.join(EXPORT_PATH, 'gpx');

    try {
        const gpxFiles = await fs.readdir(gpxSrc);
        if (gpxFiles.length > 0) {
            await copyDirectory(gpxSrc, gpxDest);
            console.log(`✅ ${gpxFiles.length} GPX files copied`);
        }
    } catch (error) {
        console.log('⚠️  No GPX files to copy');
    }

    // Copy photos
    console.log('📸 Copying photos...');
    const photosSrc = path.join(__dirname, 'uploads', 'photos');
    const photosDest = path.join(EXPORT_PATH, 'photos');

    try {
        const photoFiles = await fs.readdir(photosSrc);
        if (photoFiles.length > 0) {
            await copyDirectory(photosSrc, photosDest);
            console.log(`✅ ${photoFiles.length} photos copied`);
        }
    } catch (error) {
        console.log('⚠️  No photos to copy');
    }

    // Create README
    const readme = `# Memorides Backup - ${new Date().toISOString().split('T')[0]}

## Contenu

- \`database.json\` : Export complet de la base de données
- \`gpx/\` : Fichiers GPX des traces
- \`photos/\` : Photos géotaggées

## Restauration

Voir BACKUP.md dans le repository pour les instructions de restauration.
`;
    await fs.writeFile(path.join(EXPORT_PATH, 'README.md'), readme);

    console.log('✅ Backup completed successfully');
    return { path: EXPORT_PATH, name: EXPORT_NAME };
}

// Middleware d'authentification
function authenticateBackup(req, res, next) {
    const authHeader = req.headers.authorization;
    const backupToken = process.env.BACKUP_TOKEN;

    if (!backupToken) {
        console.error('❌ BACKUP_TOKEN not configured');
        return res.status(500).json({ error: 'Backup not configured' });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    if (token !== backupToken) {
        console.warn('⚠️  Invalid backup token attempt');
        return res.status(401).json({ error: 'Invalid token' });
    }

    next();
}

// Route de backup
async function handleBackup(req, res) {
    try {
        const result = await createBackup();
        res.json({
            success: true,
            message: 'Backup created successfully',
            backup: result.name,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Backup failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    authenticateBackup,
    handleBackup
};
