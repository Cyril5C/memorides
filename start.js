#!/usr/bin/env node
/**
 * Startup script for production
 * 1. Apply database schema
 * 2. Start the server
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function start() {
  try {
    console.log('🚀 Starting application...');
    console.log('📋 Environment check:');
    console.log('   - DATABASE_URL exists:', !!process.env.DATABASE_URL);
    console.log('   - DATABASE_URL type:', process.env.DATABASE_URL ? (process.env.DATABASE_URL.includes('postgres') ? 'PostgreSQL' : 'Other') : 'Not set');

    // Only run migrations in production (PostgreSQL)
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres')) {
      console.log('📤 Applying database migrations with Prisma Migrate...');
      try {
        const { stdout, stderr } = await execPromise('npx prisma migrate deploy');
        console.log('📋 Prisma Migrate STDOUT:');
        console.log(stdout);
        if (stderr) {
          console.log('⚠️  Prisma Migrate STDERR:');
          console.error(stderr);
        }
        console.log('✅ Migrations applied successfully');

        // Seed track types after schema is applied
        console.log('🌱 Seeding track types...');
        try {
          const { stdout: seedStdout, stderr: seedStderr } = await execPromise('node prisma/seed-track-types.js');
          console.log('📋 Track Types Seed STDOUT:');
          console.log(seedStdout);
          if (seedStderr) {
            console.log('⚠️  Track Types Seed STDERR:');
            console.error(seedStderr);
          }
        } catch (seedError) {
          console.error('⚠️  Track types seeding failed (non-critical):');
          console.error('   Error message:', seedError.message);
          // Don't throw - seeding failure is non-critical
        }
      } catch (migrateError) {
        console.error('❌ Prisma Migrate failed:');
        console.error('   Error message:', migrateError.message);
        console.error('   Error stdout:', migrateError.stdout);
        console.error('   Error stderr:', migrateError.stderr);
        throw migrateError;
      }
    } else {
      console.log('⏭️  Skipping migrations (not PostgreSQL or DATABASE_URL not set)');
    }

    // Start the server
    console.log('🚀 Starting server...');
    require('./server.js');
  } catch (error) {
    console.error('❌ Startup failed:', error.message);
    console.error('❌ Full error:', error);
    // Continue anyway - server might work even if schema push fails
    console.log('⚠️  Continuing to start server despite error...');
    require('./server.js');
  }
}

start();
