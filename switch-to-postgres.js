#!/usr/bin/env node

/**
 * Script to switch Prisma schema from SQLite to PostgreSQL
 * Used during Docker build for production
 */

const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');

console.log('🔄 Switching Prisma schema to PostgreSQL...');

let schema = fs.readFileSync(schemaPath, 'utf8');

// Replace SQLite provider with PostgreSQL
schema = schema.replace(
    /provider\s*=\s*"sqlite"/g,
    'provider = "postgresql"'
);

fs.writeFileSync(schemaPath, schema);

console.log('✅ Schema switched to PostgreSQL');
