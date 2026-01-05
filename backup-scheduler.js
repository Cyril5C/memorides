#!/usr/bin/env node

/**
 * Planificateur de backups automatiques
 * Lance le script export-data.js chaque semaine
 */

const cron = require('node-cron');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXPORT_DIR = path.join(__dirname, 'exports');
const BACKUP_RETENTION_DAYS = 30;

// Fonction pour nettoyer les vieux backups
function cleanOldBackups() {
    try {
        const files = fs.readdirSync(EXPORT_DIR);
        const now = Date.now();
        const retentionMs = BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

        let deletedCount = 0;

        files.forEach(file => {
            const filePath = path.join(EXPORT_DIR, file);
            const stats = fs.statSync(filePath);

            if (now - stats.mtimeMs > retentionMs) {
                // Supprimer fichiers et dossiers
                if (stats.isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(filePath);
                }
                deletedCount++;
                console.log(`🗑️  Deleted old backup: ${file}`);
            }
        });

        if (deletedCount > 0) {
            console.log(`✅ Cleaned ${deletedCount} old backup(s)`);
        }
    } catch (error) {
        console.error('⚠️  Error cleaning old backups:', error.message);
    }
}

// Fonction pour exécuter le backup
function runBackup() {
    console.log('\n========================================');
    console.log(`📅 Scheduled backup started at ${new Date().toLocaleString('fr-FR')}`);
    console.log('========================================\n');

    try {
        // Exécuter le script d'export
        execSync('node export-data.js', {
            stdio: 'inherit',
            cwd: __dirname
        });

        console.log('\n✅ Backup completed successfully!');

        // Nettoyer les vieux backups
        console.log('\n🧹 Cleaning old backups...');
        cleanOldBackups();

    } catch (error) {
        console.error('\n❌ Backup failed:', error.message);
        // Vous pouvez ajouter ici une notification (email, webhook, etc.)
    }

    console.log('\n========================================');
    console.log(`⏰ Next backup: ${getNextBackupDate()}`);
    console.log('========================================\n');
}

// Fonction pour obtenir la date du prochain backup
function getNextBackupDate() {
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + (7 - now.getDay()));
    nextSunday.setHours(3, 0, 0, 0);
    return nextSunday.toLocaleString('fr-FR');
}

// Planifier le backup tous les dimanches à 3h du matin
// Format cron: minute hour day month dayOfWeek
cron.schedule('0 3 * * 0', () => {
    runBackup();
}, {
    timezone: "Europe/Paris"
});

console.log('\n========================================');
console.log('📅 BACKUP SCHEDULER STARTED');
console.log('========================================');
console.log(`⏰ Schedule: Every Sunday at 3:00 AM (Europe/Paris)`);
console.log(`📁 Export directory: ${EXPORT_DIR}`);
console.log(`🗑️  Retention: ${BACKUP_RETENTION_DAYS} days`);
console.log(`⏰ Next backup: ${getNextBackupDate()}`);
console.log('========================================\n');

// Pour tester immédiatement (décommenter si nécessaire)
// console.log('🧪 Running test backup...\n');
// runBackup();
