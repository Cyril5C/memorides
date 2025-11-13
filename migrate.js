// Run Prisma migrations programmatically
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function runMigrations() {
    console.log('🔄 Starting database migrations...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set ✓' : 'Missing ✗');

    try {
        const { stdout, stderr } = await execPromise('npx prisma migrate deploy');

        if (stdout) console.log('Migration output:', stdout);
        if (stderr) console.error('Migration errors:', stderr);

        console.log('✅ Migrations completed successfully');
        return true;
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        if (error.stdout) console.log('stdout:', error.stdout);
        if (error.stderr) console.error('stderr:', error.stderr);
        return false;
    }
}

// Run migrations and exit
runMigrations()
    .then((success) => {
        process.exit(success ? 0 : 1);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
