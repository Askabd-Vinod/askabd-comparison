/**
 * AskABD Seed Framework
 *
 * Reusable, idempotent seed scripts for development and testing.
 * Running multiple times does NOT create duplicates (upsert by slug/unique key).
 *
 * Usage:
 *   npx tsx src/seed/index.ts minimal
 *   npx tsx src/seed/index.ts demo
 *   npx tsx src/seed/index.ts performance
 *   npx tsx src/seed/index.ts cleanup
 */

import { getPrisma } from '../services/prisma-client.js';
import { seedMinimal } from './minimal.js';
import { seedDemo } from './demo.js';
import { seedPerformance } from './performance.js';
import { cleanup } from './cleanup.js';

const SEED_TENANT = 'seed';

async function main() {
  const command = process.argv[2] ?? 'minimal';
  const prisma = getPrisma();

  console.log(`🌱 Seed: ${command}`);

  switch (command) {
    case 'minimal':
      await seedMinimal(prisma, SEED_TENANT);
      break;
    case 'demo':
      await seedMinimal(prisma, SEED_TENANT);
      await seedDemo(prisma, SEED_TENANT);
      break;
    case 'performance':
      await seedMinimal(prisma, SEED_TENANT);
      await seedDemo(prisma, SEED_TENANT);
      await seedPerformance(prisma, SEED_TENANT);
      break;
    case 'cleanup':
      await cleanup(prisma, SEED_TENANT);
      break;
    default:
      console.error(`Unknown command: ${command}. Use: minimal | demo | performance | cleanup`);
      process.exit(1);
  }

  await prisma.$disconnect();
  console.log('✅ Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });

export { SEED_TENANT };
