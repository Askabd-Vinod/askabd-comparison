/**
 * Shared database pool for the entire AskABD API.
 * ONE pool, shared across all services. Prevents connection exhaustion.
 *
 * Exports:
 *  - sharedPool: the single Pool instance
 *  - initializeDatabase(): warmup function — must be called at startup
 *  - getDatabaseStatus(): returns current pool readiness state
 */
import { Pool } from 'pg';
import { config } from '../config/env.js';

const dbUrl = config.DATABASE_URL!;

export const sharedPool = new Pool({
  connectionString: dbUrl,
  max: 15,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 30000,
  // RDS requires SSL in production — pg honors sslmode in connection string
  ssl: dbUrl.includes('sslmode=require') || dbUrl.includes('sslmode=verify')
    ? { rejectUnauthorized: true }
    : (config.NODE_ENV === 'production' && !dbUrl.includes('sslmode=disable'))
      ? { rejectUnauthorized: false }
      : undefined,
});

// Handle pool errors gracefully — do not crash the process
sharedPool.on('error', (err) => {
  console.error('[DB] Pool background error (non-fatal):', err.message);
});

// ─── Database Readiness State ─────────────────────────────────────────────────

type DatabaseStatus = 'starting' | 'ready' | 'degraded' | 'failed';

let dbStatus: DatabaseStatus = 'starting';

export function getDatabaseStatus(): DatabaseStatus {
  return dbStatus;
}

// ─── Database Warmup ──────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Warms the shared PostgreSQL pool at startup.
 * Acquires a connection, executes SELECT 1, releases it.
 * Retries up to MAX_RETRIES times with bounded backoff.
 *
 * Must be called during API bootstrap, BEFORE the server begins listening.
 * Sets dbStatus to 'ready' on success or 'failed' after exhausting retries.
 */
export async function initializeDatabase(): Promise<void> {
  const overallStart = Date.now();
  console.log('[DB] Initializing PostgreSQL pool...');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const attemptStart = Date.now();
    try {
      const client = await sharedPool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
      const elapsed = Date.now() - attemptStart;
      console.log(`[DB] PostgreSQL connection successful (attempt ${attempt}, ${elapsed}ms)`);
      console.log(`[DB] Warmup query successful`);
      console.log(`[DB] Database ready (total ${Date.now() - overallStart}ms)`);
      dbStatus = 'ready';
      return;
    } catch (err: any) {
      const elapsed = Date.now() - attemptStart;
      console.warn(`[DB] Connection attempt ${attempt}/${MAX_RETRIES} failed (${elapsed}ms): ${err.message}`);

      if (attempt < MAX_RETRIES) {
        console.log(`[DB] Retrying in ${RETRY_DELAY_MS}ms...`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  // All retries exhausted
  dbStatus = 'failed';
  const totalElapsed = Date.now() - overallStart;
  const errorMsg = `[DB] FATAL: Database initialization failed after ${MAX_RETRIES} attempts (${totalElapsed}ms). API cannot serve requests reliably.`;
  console.error(errorMsg);
  throw new Error(errorMsg);
}
