import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { getPool } from './connection.js';
async function migrate(): Promise<void> {
  const pool = getPool();
  await pool.query('CREATE TABLE IF NOT EXISTS _migrations (name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM _migrations ORDER BY name');
  const applied = new Set(rows.map((r) => r.name));
  const dir = resolve(import.meta.dirname, 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let count = 0;
  for (const file of files) { if (applied.has(file)) continue; await pool.query(readFileSync(join(dir, file), 'utf-8')); await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]); count++; }
  console.log(count === 0 ? 'No new migrations.' : `Applied ${count} migration(s).`);
  await pool.end();
}
migrate().catch((e) => { console.error(e); process.exit(1); });
