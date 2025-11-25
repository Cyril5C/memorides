const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function recalculateDurations() {
    console.log('🔄 Recalculating durations for all tracks...');

    try {
        // Get all tracks
        const tracks = await prisma.track.findMany();

        console.log(`📋 Found ${tracks.length} tracks to update`);

        let updated = 0;
        const averageSpeed = 17; // km/h

        for (const track of tracks) {
            // Skip tracks without distance
            if (!track.distance) {
                console.log(`⏭️  Skipping ${track.name || track.filename}: no distance`);
                continue;
            }

            // Calculate duration: Distance (already in km) / 17 km/h * 60 min
            const distanceKm = track.distance; // Distance is already in km in database
            const durationMinutes = (distanceKm / averageSpeed) * 60;

            // Update track
            await prisma.track.update({
                where: { id: track.id },
                data: { duration: durationMinutes }
            });

            updated++;
            console.log(`✅ Updated ${track.name || track.filename}: ${distanceKm.toFixed(2)} km → ${durationMinutes.toFixed(0)} min`);
        }

        console.log(`\n✅ Successfully updated ${updated} tracks`);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

recalculateDurations();
