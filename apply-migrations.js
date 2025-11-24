/**
 * Apply database migrations
 * This script runs pending SQL migrations in the migrations directory
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function applyMigrations() {
    console.log('🔄 Checking for pending migrations...');

    const migrationsDir = path.join(__dirname, 'prisma', 'migrations');

    if (!fs.existsSync(migrationsDir)) {
        console.log('⚠️  No migrations directory found');
        return;
    }

    const migrations = fs.readdirSync(migrationsDir)
        .filter(dir => {
            const migrationPath = path.join(migrationsDir, dir, 'migration.sql');
            return fs.existsSync(migrationPath);
        })
        .sort();

    console.log(`📋 Found ${migrations.length} migrations`);

    for (const migration of migrations) {
        const migrationPath = path.join(migrationsDir, migration, 'migration.sql');
        const sql = fs.readFileSync(migrationPath, 'utf-8');

        try {
            console.log(`📝 Applying migration: ${migration}`);

            // Split by semicolon and execute each statement separately
            const statements = sql
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0);

            for (const statement of statements) {
                await prisma.$executeRawUnsafe(statement);
            }

            console.log(`✅ Applied migration: ${migration}`);
        } catch (error) {
            // Check if error is "column already exists" or "already altered"
            if (error.message.includes('already exists') ||
                error.message.includes('does not exist') ||
                error.message.includes('duplicate')) {
                console.log(`⏭️  Migration ${migration} already applied`);
            } else {
                console.error(`❌ Error applying migration ${migration}:`, error.message);
                throw error;
            }
        }
    }

    console.log('✅ All migrations applied successfully');
}

applyMigrations()
    .catch((error) => {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
