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

echo "Step 1: Setting up database..."

# Try normal migration first
echo "Attempting migration deployment..."
node migrate.js

# If migration fails, try database reset (one-time fix for migration conflicts)
if [ $? -ne 0 ]; then
    echo "Migration failed, attempting database reset..."
    node reset-db.js
fi

if [ $? -eq 0 ]; then
    echo "Step 3: Starting server..."
    node server.js
else
    echo "ERROR: Migrations failed, aborting startup"
    exit 1
fi
