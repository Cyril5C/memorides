#!/bin/sh
set -e

echo "========================================="
echo "MesRides - Starting application"
echo "========================================="
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "DATABASE_URL: ${DATABASE_URL:+SET}"
echo "PORT: ${PORT}"
echo "========================================="

echo "Step 1: Running database migrations..."
node migrate.js

if [ $? -eq 0 ]; then
    echo "Step 2: Starting server..."
    node server.js
else
    echo "ERROR: Migrations failed, aborting startup"
    exit 1
fi
