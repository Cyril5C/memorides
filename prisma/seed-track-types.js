const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedTrackTypes() {
  console.log('🌱 Seeding track types...');

  const trackTypes = [
    { value: 'hiking', label: 'Randonnée', icon: '🥾', order: 1 },
    { value: 'cycling', label: 'Vélo route', icon: '🚴', order: 2 },
    { value: 'gravel', label: 'Gravel', icon: '🚵', order: 3 }
  ];

  for (const type of trackTypes) {
    await prisma.trackType.upsert({
      where: { value: type.value },
      update: {},
      create: type
    });
    console.log(`✓ Track type '${type.label}' seeded`);
  }

  console.log('✅ Track types seeding completed');
}

seedTrackTypes()
  .catch((e) => {
    console.error('Error seeding track types:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
