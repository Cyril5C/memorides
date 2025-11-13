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

echo "Step 1: Resolving any failed migrations..."
# Mark the failed init migration as rolled back (will fail silently if no failed migrations)
npx prisma migrate resolve --rolled-back 20251112150838_init 2>/dev/null || echo "No failed migration to resolve"

echo "Step 2: Running database migrations..."
node migrate.js

if [ $? -eq 0 ]; then
    echo "Step 3: Starting server..."
    node server.js
else
    echo "ERROR: Migrations failed, aborting startup"
    exit 1
fi
