import '../loadEnv';
import { prisma } from '../config/db';

async function main() {
  // Cancel all stale REQUESTED emergencies
  const result = await prisma.emergencyRequest.updateMany({
    where: { status: 'REQUESTED' },
    data: { status: 'CANCELLED', completedAt: new Date() },
  });
  console.log(`Cancelled ${result.count} stale emergency requests`);
  
  // Reset VITA-04 to AVAILABLE in case it got stuck
  await prisma.ambulanceUnit.updateMany({
    where: { callSign: 'VITA-04' },
    data: { status: 'AVAILABLE' },
  });
  console.log('VITA-04 reset to AVAILABLE');
  
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
