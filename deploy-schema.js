#!/usr/bin/env node
/**
 * Deploy schema changes to production
 * This script:
 * 1. Pushes schema changes to the database
 * 2. Seeds track types if needed
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function deploy() {
  try {
    console.log('🚀 Deploying schema changes...');

    // Push schema changes
    console.log('📤 Pushing schema to database...');
    const { stdout, stderr } = await execPromise('npx prisma db push');
    console.log(stdout);
    if (stderr) console.error(stderr);

    // Seed track types
    console.log('🌱 Seeding track types...');
    const { stdout: seedOut, stderr: seedErr } = await execPromise('node prisma/seed-track-types.js');
    console.log(seedOut);
    if (seedErr) console.error(seedErr);

    console.log('✅ Deployment completed successfully!');
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

deploy();
