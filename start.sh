#!/bin/sh

echo "========================================="
echo "MesRides - Starting application"
echo "========================================="
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "DATABASE_URL: ${DATABASE_URL:+SET}"
echo "PORT: ${PORT}"
echo "========================================="

echo "Step 1: Checking volume mount..."
echo "Contents of /app:"
ls -la /app/ || echo "Cannot list /app"
echo "Contents of /app/uploads:"
ls -la /app/uploads/ || echo "Cannot list /app/uploads"
echo "Disk usage:"
df -h /app/uploads || echo "Cannot check disk usage"

echo "Step 2: Creating upload directories..."
mkdir -p /app/uploads/gpx
mkdir -p /app/uploads/photos
echo "Upload directories created/verified"

echo "Step 3: Setting up database..."

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

echo "Step 4: Final check before starting server..."
echo "Upload directory contents:"
ls -la /app/uploads/gpx || echo "GPX directory empty or not accessible"
ls -la /app/uploads/photos || echo "Photos directory empty or not accessible"

echo "Step 5: Starting server..."
exec node server.js
