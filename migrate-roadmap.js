const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateRoadmap() {
    console.log('🔄 Starting roadmap migration...');

    try {
        // Check if roadmap column already exists
        const checkColumn = await prisma.$queryRaw`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='Track' AND column_name='roadmap'
        `;

        if (checkColumn.length > 0) {
            console.log('✓ Column roadmap already exists');
        } else {
            // Add roadmap column with default value 'later'
            console.log('📝 Adding roadmap column...');
            await prisma.$executeRaw`
                ALTER TABLE "Track" ADD COLUMN "roadmap" TEXT NOT NULL DEFAULT 'later'
            `;
            console.log('✓ Column roadmap added successfully');
        }

        // Update existing tracks: set 'done' if completedAt is not null
        console.log('📝 Updating existing tracks...');
        const result = await prisma.$executeRaw`
            UPDATE "Track"
            SET "roadmap" = 'done'
            WHERE "completedAt" IS NOT NULL AND "roadmap" = 'later'
        `;
        console.log(`✓ Updated ${result} tracks to 'done' status`);

        // Check if index already exists
        const checkIndex = await prisma.$queryRaw`
            SELECT indexname
            FROM pg_indexes
            WHERE tablename = 'Track' AND indexname = 'Track_roadmap_idx'
        `;

        if (checkIndex.length > 0) {
            console.log('✓ Index Track_roadmap_idx already exists');
        } else {
            // Create index on roadmap column
            console.log('📝 Creating index on roadmap column...');
            await prisma.$executeRaw`
                CREATE INDEX "Track_roadmap_idx" ON "Track"("roadmap")
            `;
            console.log('✓ Index Track_roadmap_idx created successfully');
        }

        // Verification query
        console.log('\n📊 Verification - Roadmap status distribution:');
        const stats = await prisma.$queryRaw`
            SELECT
                roadmap,
                COUNT(*) as count,
                COUNT(CASE WHEN "completedAt" IS NOT NULL THEN 1 END) as completed_count
            FROM "Track"
            GROUP BY roadmap
            ORDER BY roadmap
        `;

        stats.forEach(stat => {
            console.log(`  ${stat.roadmap}: ${stat.count} tracks (${stat.completed_count} completed)`);
        });

        console.log('\n✅ Migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

migrateRoadmap();
