import '../loadEnv';
import { prisma } from '../config/db';

async function main() {
  const units = await prisma.ambulanceUnit.findMany({
    where: { callSign: { in: ['VITA-04', 'VITA-07', 'VITA-12'] } },
    include: {
      driver: { select: { email: true, name: true } },
      facility: { select: { name: true } },
    },
  });
  console.log('Ambulance units:');
  console.log(JSON.stringify(units, null, 2));
  
  const emergencies = await prisma.emergencyRequest.findMany({
    where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    select: { id: true, status: true, facilityId: true },
    take: 5,
  });
  console.log('\nActive emergencies:');
  console.log(JSON.stringify(emergencies, null, 2));
  
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
