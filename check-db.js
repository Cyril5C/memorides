const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDB() {
    try {
        const tracks = await prisma.track.findMany({
            select: {
                id: true,
                filename: true,
                name: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' }
        });
        
        console.log(`\n📊 Database has ${tracks.length} tracks:\n`);
        tracks.forEach(track => {
            console.log(`  - ${track.filename}`);
            console.log(`    Name: ${track.name}`);
            console.log(`    Created: ${track.createdAt}`);
            console.log('');
        });
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkDB();
