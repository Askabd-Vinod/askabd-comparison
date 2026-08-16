/**
 * AskABD OTP Store — PostgreSQL-backed OTP persistence.
 * Survives API restarts. One OTP per client at a time.
 *
 * Table: otp_challenges
 * Auto-created on first use if it does not exist.
 */
import { sharedPool } from './db-pool.js';

export interface OtpRecord {
  otp: string;
  expiry: string;
  attempts: number;
  email?: string;
  clientName?: string;
  businessOwner?: string;
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
 */
export async function storeOtp(clientId: string, otp: string, expiry: string, meta?: { email?: string; clientName?: string; businessOwner?: string }): Promise<void> {
  await ensureTable();
  await sharedPool.query(
    `INSERT INTO otp_challenges (client_id, otp_hash, expiry, attempts, email, client_name, business_owner)
     VALUES ($1, $2, $3, 0, $4, $5, $6)
     ON CONFLICT (client_id) DO UPDATE SET otp_hash = $2, expiry = $3, attempts = 0, email = $4, client_name = $5, business_owner = $6, updated_at = NOW()`,
    [clientId, otp, expiry, meta?.email || null, meta?.clientName || null, meta?.businessOwner || null]
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
