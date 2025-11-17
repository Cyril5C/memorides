#!/usr/bin/env node
/**
 * Restore PostgreSQL provider in schema
 */

const fs = require('fs');

const SCHEMA_PATH = './prisma/schema.prisma';

console.log('🔄 Restoring PostgreSQL provider...');

let schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
schema = schema.replace(/provider = "sqlite"/, 'provider = "postgresql"');
fs.writeFileSync(SCHEMA_PATH, schema);

console.log('✓ Schema restored to PostgreSQL');
