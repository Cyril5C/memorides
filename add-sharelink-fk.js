/**
 * Add foreign key constraint to ShareLink table
 * This is separate from the migration because the DO block syntax
 * doesn't work well with the statement-by-statement execution
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addForeignKey() {
    try {
        console.log('🔗 Adding ShareLink foreign key constraint...');

        // Check if constraint already exists
        const result = await prisma.$queryRaw`
            SELECT 1 FROM pg_constraint
            WHERE conname = 'ShareLink_trackId_fkey'
        `;

        if (result.length > 0) {
            console.log('⏭️  Foreign key constraint already exists');
            return;
        }

        // Add the constraint
        await prisma.$executeRaw`
            ALTER TABLE "ShareLink"
            ADD CONSTRAINT "ShareLink_trackId_fkey"
            FOREIGN KEY ("trackId") REFERENCES "Track"("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        `;

        console.log('✅ Foreign key constraint added successfully');
    } catch (error) {
        if (error.message.includes('already exists')) {
            console.log('⏭️  Foreign key constraint already exists');
        } else {
            console.error('❌ Error adding foreign key:', error.message);
            throw error;
        }
    }
}

addForeignKey()
    .catch((error) => {
        console.error('❌ Failed to add foreign key:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
