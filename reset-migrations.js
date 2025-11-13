// Reset failed migrations in production database
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function resetMigrations() {
    console.log('🔄 Resolving failed migration state...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set ✓' : 'Missing ✗');

    try {
        // Mark failed migration as rolled back
        const { stdout, stderr } = await execPromise('npx prisma migrate resolve --rolled-back 20251112150838_init');

        if (stdout) console.log('Output:', stdout);
        if (stderr) console.error('Stderr:', stderr);

        console.log('✅ Failed migration marked as rolled back');

        // Now deploy all migrations
        console.log('🔄 Deploying all migrations...');
        const deployResult = await execPromise('npx prisma migrate deploy');

        if (deployResult.stdout) console.log('Deploy output:', deployResult.stdout);
        if (deployResult.stderr) console.error('Deploy stderr:', deployResult.stderr);

        console.log('✅ All migrations deployed successfully');
        return true;
    } catch (error) {
        console.error('❌ Migration reset failed:', error.message);
        if (error.stdout) console.log('stdout:', error.stdout);
        if (error.stderr) console.error('stderr:', error.stderr);
        return false;
    }
}

// Run reset and exit
resetMigrations()
    .then((success) => {
        process.exit(success ? 0 : 1);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
