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

echo "Step 1: Cleaning up old SQLite migrations..."
# Mark all old SQLite migrations as rolled back (these won't work on PostgreSQL)
npx prisma migrate resolve --rolled-back 20251112150838_init 2>/dev/null || true
npx prisma migrate resolve --rolled-back 20251112153018_add_title_and_comments 2>/dev/null || true
npx prisma migrate resolve --rolled-back 20251112154037_add_photo_track_relation 2>/dev/null || true
npx prisma migrate resolve --rolled-back 20251113090108_add_labels_to_track 2>/dev/null || true
npx prisma migrate resolve --rolled-back 20251113101104_create_label_tables 2>/dev/null || true
echo "Old migrations cleaned up"

echo "Step 2: Running database migrations..."
node migrate.js

if [ $? -eq 0 ]; then
    echo "Step 3: Starting server..."
    node server.js
else
    echo "ERROR: Migrations failed, aborting startup"
    exit 1
fi
