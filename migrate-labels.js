const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateLabels() {
    console.log('🔄 Starting label migration...');

    try {
        // Get all tracks with labels
        const tracks = await prisma.$queryRaw`
            SELECT id, labels FROM Track WHERE labels IS NOT NULL AND labels != ''
        `;

        console.log(`Found ${tracks.length} tracks with labels to migrate`);

        for (const track of tracks) {
            console.log(`\nMigrating track ${track.id}...`);
            const labelNames = track.labels.split(',').map(l => l.trim()).filter(l => l);

            for (const labelName of labelNames) {
                console.log(`  - Processing label: "${labelName}"`);

                // Create or get label
                let label = await prisma.label.findUnique({
                    where: { name: labelName }
                });

                if (!label) {
                    label = await prisma.label.create({
                        data: { name: labelName }
                    });
                    console.log(`    ✓ Created new label: "${labelName}"`);
                } else {
                    console.log(`    ✓ Label already exists: "${labelName}"`);
                }

                // Create track-label relation
                const existing = await prisma.trackLabel.findUnique({
                    where: {
                        trackId_labelId: {
                            trackId: track.id,
                            labelId: label.id
                        }
                    }
                });

                if (!existing) {
                    await prisma.trackLabel.create({
                        data: {
                            trackId: track.id,
                            labelId: label.id
                        }
                    });
                    console.log(`    ✓ Created track-label relation`);
                }
            }
        }

        // Now drop the old labels column
        console.log('\n🔄 Dropping old labels column...');
        await prisma.$executeRaw`ALTER TABLE Track DROP COLUMN labels`;
        console.log('✓ Old labels column dropped');

        // Regenerate Prisma Client
        console.log('\n✅ Migration completed successfully!');
        console.log('📝 Run: npx prisma generate');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

migrateLabels();
