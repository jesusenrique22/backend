import '../loadEnv';

import { connectDatabase, disconnectDatabase } from '../config/db';
import { backfillAllMissingProfiles } from '../services/userProfile.service';

async function main() {
  await connectDatabase();
  const result = await backfillAllMissingProfiles();
  console.log('Backfill completado:', result);
  await disconnectDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
