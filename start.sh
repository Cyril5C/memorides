#!/bin/sh
set -e

echo "🚀 Starting application..."

# Apply database migrations
echo "🔄 Applying database migrations..."
node apply-migrations.js

# Add ShareLink foreign key constraint
echo "🔗 Adding ShareLink foreign key..."
node add-sharelink-fk.js

# Start the server
echo "🌐 Starting server..."
exec node server.js
