/**
 * Database connection module.
 * Re-exports the shared pool from db-pool.ts to maintain a single connection pool.
 */
import pg from 'pg';
import { sharedPool } from '../services/db-pool.js';

export function getPool(): pg.Pool {
  return sharedPool as unknown as pg.Pool;
}

export type DbClient = pg.Pool;
