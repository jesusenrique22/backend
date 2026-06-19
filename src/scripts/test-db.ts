import '../loadEnv';
import { connectDatabase, disconnectDatabase, prisma } from '../config/db';
import { listPendingFacilityRequests } from '../services/emergency.service';

async function main() {
  await connectDatabase();
  
  // Find driver ID for conductor@vita.com
  const driver = await prisma.user.findUnique({
    where: { email: 'conductor@vita.com' }
  });
  
  if (!driver) {
    console.error('Driver not found');
    return;
  }
  
  console.log('Driver ID:', driver.id);
  
  try {
    const pending = await listPendingFacilityRequests(driver.id);
    console.log('Pending requests returned by listPendingFacilityRequests:', pending);
  } catch (e: any) {
    console.error('Error calling listPendingFacilityRequests:', e.message);
  }
  
  await disconnectDatabase();
}

main().catch(console.error);
