#!/bin/sh

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
if node migrate.js; then
    echo "✅ Migration successful"
else
    echo "⚠️  Migration failed, attempting database reset..."
    if node reset-db.js; then
        echo "✅ Database reset successful"
    else
        echo "❌ Database setup failed completely"
        exit 1
    fi
fi

echo "Step 2: Starting server..."
exec node server.js
