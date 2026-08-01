import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '../config/env.js';

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    const adapter = new PrismaPg({ connectionString: config.DATABASE_URL });
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
