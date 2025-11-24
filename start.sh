#!/bin/sh
set -e

echo "🚀 Starting application..."

# Apply database migrations
echo "🔄 Applying database migrations..."
node apply-migrations.js

# Start the server
echo "🌐 Starting server..."
exec node server.js
