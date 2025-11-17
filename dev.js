#!/usr/bin/env node
/**
 * Development server launcher
 * Automatically configures Prisma for SQLite and starts the server
 */

const fs = require('fs');
const { spawn } = require('child_process');

const SCHEMA_PATH = './prisma/schema.prisma';

console.log('🔧 Configuring for local development...');

// Read schema
let schema = fs.readFileSync(SCHEMA_PATH, 'utf8');

// Replace postgresql with sqlite
const originalProvider = schema.match(/provider = "(\w+)"/)?.[1];
if (originalProvider !== 'sqlite') {
    schema = schema.replace(/provider = "postgresql"/, 'provider = "sqlite"');
    fs.writeFileSync(SCHEMA_PATH, schema);
    console.log('✓ Switched to SQLite provider');

    // Regenerate Prisma client
    console.log('⚙️  Generating Prisma client...');
    const generate = spawn('npx', ['prisma', 'generate'], { stdio: 'inherit' });

    generate.on('close', (code) => {
        if (code === 0) {
            console.log('✓ Prisma client generated\n');
            startServer();
        } else {
            process.exit(code);
        }
    });
} else {
    console.log('✓ Already using SQLite\n');
    startServer();
}

function startServer() {
    console.log('🚀 Starting development server...\n');
    const server = spawn('node', ['server.js'], { stdio: 'inherit' });

    // Cleanup on exit
    process.on('SIGINT', () => {
        console.log('\n\n🔄 Restoring PostgreSQL provider...');
        let schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
        schema = schema.replace(/provider = "sqlite"/, 'provider = "postgresql"');
        fs.writeFileSync(SCHEMA_PATH, schema);
        console.log('✓ Schema restored');
        process.exit();
    });

    server.on('close', (code) => {
        process.exit(code);
    });
}
