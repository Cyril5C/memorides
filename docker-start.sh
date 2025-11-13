#!/bin/bash

# Script to start MesRides in production mode with Docker Compose

echo "🚀 Starting MesRides in production mode..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "⚠️  .env.production not found. Creating from template..."
    cat > .env.production << EOF
# Production Environment Variables
DATABASE_URL="postgresql://mesrides:mesrides_secure_password@postgres:5432/mesrides"
POSTGRES_PASSWORD=mesrides_secure_password
PORT=8080
NODE_ENV=production
EOF
    echo "✅ .env.production created. Please update the passwords!"
fi

# Load environment variables
export $(cat .env.production | grep -v '^#' | xargs)

echo "📦 Building Docker images..."
docker-compose build

echo ""
echo "🗄️  Starting PostgreSQL database..."
docker-compose up -d postgres

echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

echo ""
echo "🚀 Starting application..."
docker-compose up -d app

echo ""
echo "✅ MesRides is starting!"
echo ""
echo "📊 Check status:"
echo "   docker-compose ps"
echo ""
echo "📝 View logs:"
echo "   docker-compose logs -f"
echo ""
echo "🌐 Access application:"
echo "   http://localhost:8080"
echo ""
echo "🛑 Stop application:"
echo "   docker-compose down"
echo ""
