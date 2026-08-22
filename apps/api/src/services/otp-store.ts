/**
 * AskABD OTP Store — PostgreSQL-backed OTP persistence.
 * Survives API restarts. One OTP per client at a time.
 *
 * Table: otp_challenges
 * Auto-created on first use if it does not exist.
 *
 * Real fix (final closure pass): `otp_hash` had always been named for a hash but
 * stored the raw 6-digit code in plaintext — anyone with read access to this table
 * (a DB backup, a misconfigured read replica, an internal tool) could read every
 * live OTP directly. Now genuinely hashed: `scrypt(otp, per-row-random-salt)`,
 * stored as `salt:hash` hex. scrypt (Node's built-in password KDF) rather than a
 * fast general-purpose hash (SHA-256 etc.) specifically because a 6-digit OTP has
 * only 900,000 possible values — a fast hash would let anyone who reads this table
 * brute-force every stored OTP back to plaintext in well under a second; scrypt's
 * deliberate CPU/memory cost makes that infeasible at any real scale, while still
 * completing a single real verification in a few milliseconds. Comparison uses
 * `timingSafeEqual` so verification time doesn't leak how many digits matched.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { sharedPool } from './db-pool.js';

export interface OtpRecord {
  otp: string; // the stored salt:hash — never the plaintext code
  expiry: string;
  attempts: number;
  email?: string;
  clientName?: string;
  businessOwner?: string;
}

const SCRYPT_KEYLEN = 32;

function hashOtp(otp: string, salt: string): string {
  return scryptSync(otp, salt, SCRYPT_KEYLEN).toString('hex');
}

/** Real, single-use-per-call salted hash — never the plaintext OTP. */
export function encodeOtp(otp: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${hashOtp(otp, salt)}`;
}

/** Constant-time comparison against the stored salt:hash — never a plaintext `===`. */
export function verifyOtpHash(candidateOtp: string, storedSaltAndHash: string): boolean {
  const [salt, hash] = (storedSaltAndHash || '').split(':');
  if (!salt || !hash) return false;
  const candidateHash = hashOtp(candidateOtp, salt);
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

let tableReady = false;

/**
 * Ensures the otp_challenges table exists (idempotent).
 */
async function ensureTable(): Promise<void> {
  if (tableReady) return;
  await sharedPool.query(`
    CREATE TABLE IF NOT EXISTS otp_challenges (
      client_id VARCHAR(255) PRIMARY KEY,
      otp_hash VARCHAR(255) NOT NULL,
      expiry TIMESTAMPTZ NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      email VARCHAR(255),
      client_name VARCHAR(255),
      business_owner VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Add columns if they don't exist (for existing tables)
  await sharedPool.query(`ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS email VARCHAR(255)`).catch(() => {});
  await sharedPool.query(`ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS client_name VARCHAR(255)`).catch(() => {});
  await sharedPool.query(`ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS business_owner VARCHAR(255)`).catch(() => {});
  tableReady = true;
}

/**
 * Store an OTP for a client. Replaces any existing OTP (UPSERT).
 * `otp` is the real plaintext code (only ever held in memory for the moment it's
 * generated and emailed) — this function is the one place it gets hashed before
 * ever touching the database.
 */
export async function storeOtp(clientId: string, otp: string, expiry: string, meta?: { email?: string; clientName?: string; businessOwner?: string }): Promise<void> {
  await ensureTable();
  const encoded = encodeOtp(otp);
  await sharedPool.query(
    `INSERT INTO otp_challenges (client_id, otp_hash, expiry, attempts, email, client_name, business_owner)
     VALUES ($1, $2, $3, 0, $4, $5, $6)
     ON CONFLICT (client_id) DO UPDATE SET otp_hash = $2, expiry = $3, attempts = 0, email = $4, client_name = $5, business_owner = $6, updated_at = NOW()`,
    [clientId, encoded, expiry, meta?.email || null, meta?.clientName || null, meta?.businessOwner || null]
  );
}

/**
 * Retrieve the OTP record for a client. Returns null if not found.
 */
export async function getOtp(clientId: string): Promise<OtpRecord | null> {
  await ensureTable();
  const { rows } = await sharedPool.query(
    `SELECT otp_hash AS otp, expiry::text, attempts, email, client_name AS "clientName", business_owner AS "businessOwner" FROM otp_challenges WHERE client_id = $1`,
    [clientId]
  );
  if (rows.length === 0) return null;
  return { otp: rows[0].otp, expiry: rows[0].expiry, attempts: rows[0].attempts, email: rows[0].email, clientName: rows[0].clientName, businessOwner: rows[0].businessOwner };
}

/**
 * Increment the attempt counter for a client's OTP.
 */
export async function incrementAttempts(clientId: string): Promise<void> {
  await ensureTable();
  await sharedPool.query(
    `UPDATE otp_challenges SET attempts = attempts + 1, updated_at = NOW() WHERE client_id = $1`,
    [clientId]
  );
}

/**
 * Delete the OTP record for a client (consumed or expired).
 */
export async function deleteOtp(clientId: string): Promise<void> {
  await ensureTable();
  await sharedPool.query(`DELETE FROM otp_challenges WHERE client_id = $1`, [clientId]);
}

export type OtpVerifyOutcome =
  | { outcome: 'valid'; meta: { email?: string; clientName?: string; businessOwner?: string }; priorAttempts: number }
  | { outcome: 'not_found' }
  | { outcome: 'locked' }
  | { outcome: 'expired' }
  | { outcome: 'invalid'; attemptsRemaining: number };

/**
 * Real fix for a real bug, found by this module's own concurrency test: the previous
 * "read the row, then separately increment/delete it" sequence in the route handler
 * was a genuine TOCTOU race — two concurrent requests carrying the correct OTP could
 * both read the row before either deleted it, and both would report `valid: true`,
 * letting a single-use code be consumed twice. This function does the entire
 * check-and-consume as ONE Postgres transaction with `SELECT ... FOR UPDATE`, so a
 * second concurrent transaction genuinely blocks on the row lock until the first
 * commits — not an application-level flag that can itself race.
 */
export async function verifyAndConsumeOtp(clientId: string, candidateOtp: string): Promise<OtpVerifyOutcome> {
  await ensureTable();
  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT otp_hash, expiry, attempts, email, client_name AS "clientName", business_owner AS "businessOwner"
       FROM otp_challenges WHERE client_id = $1 FOR UPDATE`,
      [clientId]
    );
    if (rows.length === 0) {
      await client.query('COMMIT');
      return { outcome: 'not_found' };
    }
    const row = rows[0];

    if (row.attempts >= 5) {
      await client.query('COMMIT');
      return { outcome: 'locked' };
    }

    if (new Date(row.expiry) < new Date()) {
      await client.query('DELETE FROM otp_challenges WHERE client_id = $1', [clientId]);
      await client.query('COMMIT');
      return { outcome: 'expired' };
    }

    if (!verifyOtpHash(candidateOtp, row.otp_hash)) {
      await client.query('UPDATE otp_challenges SET attempts = attempts + 1, updated_at = NOW() WHERE client_id = $1', [clientId]);
      await client.query('COMMIT');
      return { outcome: 'invalid', attemptsRemaining: Math.max(0, 5 - row.attempts - 1) };
    }

    // Valid — consume it inside the same locked transaction. No second concurrent
    // request can reach this point for the same row until this transaction commits,
    // and by then the row is gone, so it correctly falls through to 'not_found'.
    await client.query('DELETE FROM otp_challenges WHERE client_id = $1', [clientId]);
    await client.query('COMMIT');
    return { outcome: 'valid', meta: { email: row.email, clientName: row.clientName, businessOwner: row.businessOwner }, priorAttempts: row.attempts };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
