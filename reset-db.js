// Script to completely reset the database for a fresh start
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function resetDatabase() {
    console.log('🔄 Resetting database for fresh migration...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set ✓' : 'Missing ✗');

    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL not set');
        return false;
    }

    try {
        // Reset the database completely (this will drop all tables and migrations)
        console.log('Pushing schema to database (will reset everything)...');
        const { stdout, stderr } = await execPromise('npx prisma db push --force-reset --accept-data-loss');

        if (stdout) console.log('Output:', stdout);
        if (stderr) console.warn('Warnings:', stderr);

        console.log('✅ Database reset complete');

        // Mark the migration as applied (since we just pushed the schema)
        console.log('Marking migration as resolved...');
        const resolveResult = await execPromise('npx prisma migrate resolve --applied 20251113000000_init_postgresql');

        if (resolveResult.stdout) console.log('Resolve output:', resolveResult.stdout);

        console.log('✅ Migration marked as applied');
        return true;
    } catch (error) {
        console.error('❌ Database reset failed:', error.message);
        if (error.stdout) console.log('stdout:', error.stdout);
        if (error.stderr) console.error('stderr:', error.stderr);
        return false;
    }
}

// Run reset and exit
resetDatabase()
    .then((success) => {
        process.exit(success ? 0 : 1);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
