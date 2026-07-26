import pg from 'pg';
import { config } from '../config/env.js';
const { Pool } = pg;
let pool: pg.Pool | null = null;
export function getPool(): pg.Pool { if (!pool) pool = new Pool({ connectionString: config.DATABASE_URL, max: 20 }); return pool; }
export type DbClient = pg.Pool;
