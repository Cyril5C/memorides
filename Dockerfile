FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy prisma schema and switch script
COPY prisma ./prisma/
COPY switch-to-postgres.js ./

# Switch schema to PostgreSQL for production
RUN node switch-to-postgres.js

# Set a dummy DATABASE_URL for the build phase
# This is only used for generating Prisma Client, not for actual DB connection
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

# Install dependencies (this will run prisma generate via postinstall)
RUN npm ci --only=production

# Copy application files
COPY . .

# Create uploads directory
RUN mkdir -p uploads/gpx uploads/photos

# Expose port
EXPOSE 8080

# Start the application
CMD ["node", "server.js"]
