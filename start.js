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

    // Only run db push in production (PostgreSQL)
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres')) {
      console.log('📤 Applying database schema with Prisma DB Push...');
      try {
        const { stdout, stderr } = await execPromise('npx prisma db push --accept-data-loss --skip-generate');
        console.log('📋 Prisma DB Push STDOUT:');
        console.log(stdout);
        if (stderr) {
          console.log('⚠️  Prisma DB Push STDERR:');
          console.error(stderr);
        }
        console.log('✅ Schema applied successfully');
      } catch (dbPushError) {
        console.error('❌ Prisma DB Push failed:');
        console.error('   Error message:', dbPushError.message);
        console.error('   Error stdout:', dbPushError.stdout);
        console.error('   Error stderr:', dbPushError.stderr);
        throw dbPushError;
      }
    } else {
      console.log('⏭️  Skipping schema push (not PostgreSQL or DATABASE_URL not set)');
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
