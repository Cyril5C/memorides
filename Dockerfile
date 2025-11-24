FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy prisma schema first (needed for initial install)
COPY prisma ./prisma/

# Set a dummy DATABASE_URL for the build phase
# This is only used for generating Prisma Client, not for actual DB connection
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

# Install dependencies with SQLite schema (for now)
RUN npm ci --only=production

# Copy application files
COPY . .

# NOW switch schema to PostgreSQL and regenerate client
RUN node switch-to-postgres.js && npx prisma generate

# Create uploads directory
RUN mkdir -p uploads/gpx uploads/photos

# Expose port
EXPOSE 8080

# Start the application with migrations
CMD ["sh", "start.sh"]
