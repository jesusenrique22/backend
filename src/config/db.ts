import { prisma } from '../lib/prisma';

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  console.log('PostgreSQL conectado (Prisma)');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export { prisma };
