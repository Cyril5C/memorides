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

    // Only run db push in production (PostgreSQL)
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres')) {
      console.log('📤 Applying database schema...');
      const { stdout, stderr } = await execPromise('npx prisma db push --accept-data-loss --skip-generate');
      console.log(stdout);
      if (stderr && !stderr.includes('warnings')) console.error(stderr);
      console.log('✅ Schema applied');
    }

    // Start the server
    console.log('🚀 Starting server...');
    require('./server.js');
  } catch (error) {
    console.error('❌ Startup failed:', error.message);
    // Continue anyway - server might work even if schema push fails
    require('./server.js');
  }
}

start();
