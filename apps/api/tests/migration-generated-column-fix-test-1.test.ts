/**
 * Real bug fix regression test — Playwright Coverage Completion, Batch 2
 * (2026-08-30). Found live via `batch2_staff_operations_test_1.mjs`'s
 * real Execute Migration click against the real `public` schema: the
 * data-copy step for `oc_gaps` genuinely failed with Postgres's real
 * error "cannot insert a non-DEFAULT value into column" because
 * `oc_gaps.maturity_gap` is a real `GENERATED ALWAYS AS (...) STORED`
 * column, and the old `INSERT INTO target SELECT * FROM source` used an
 * implicit column list that includes generated columns — which Postgres
 * refuses to have written to directly.
 *
 * Fix: the data-copy step now queries `information_schema.columns` for
 * the real, non-generated columns and uses an explicit column list on
 * both sides of the INSERT ... SELECT.
 *
 * This test reproduces the exact real scenario: migrate the real
 * `public` schema (which genuinely contains `oc_gaps`) into a real,
 * disposable target schema, and asserts the `oc_gaps` data step
 * completes — not `failed` — with real rows copied.
 */
import { describe, expect, it, afterAll } from 'vitest';
import { MigrationExecutionService } from '../src/services/migration-execution-service.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { sharedPool } from '../src/services/db-pool.js';

let clientId: string | undefined;
let migrationId: string | undefined;
let targetSchema: string | undefined;

afterAll(async () => {
  if (targetSchema) await sharedPool.query(`DROP SCHEMA IF EXISTS ${targetSchema} CASCADE`).catch(() => {});
  if (migrationId) await sharedPool.query('DELETE FROM oc_migration_runs WHERE id = $1', [migrationId]).catch(() => {});
  if (clientId) await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [clientId]).catch(() => {});
});

describe('MigrationExecutionService — real GENERATED ALWAYS column fix (oc_gaps.maturity_gap)', () => {
  it('a real migration of the public schema (which genuinely contains oc_gaps, a table with a real generated column) completes the oc_gaps data-copy step instead of failing', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient({
      name: 'Migration Generated-Column Fix Test Client', logo: '', industry: 'Technology', country: 'India',
      timezone: 'UTC', businessSize: 'Medium', supportModel: 'Managed', criticality: 'standard',
      primaryContact: 'test@example.com', departments: [], capabilities: [], processes: [],
      applications: [], techApps: [], techServices: [], techApis: [], techDatabases: [],
      techServers: [], techCloud: [], techInfrastructure: [], environments: {}, monitoring: {},
      enabledServices: [],
    } as any);
    clientId = client.id;

    const migrationService = new MigrationExecutionService();
    const plan = await migrationService.createPlan(client.id, 'public');
    migrationId = plan.id;
    targetSchema = plan.targetSchema;

    const executed = await migrationService.execute(plan.id, undefined, client.id);

    const gapsStep = executed.steps.find((s) => s.type === 'data' && s.object === 'oc_gaps');
    expect(gapsStep).toBeDefined();
    // The real, specific defect this test reproduces: before the fix,
    // this step's real status was 'failed' with the real Postgres
    // "cannot insert a non-DEFAULT value into column" error.
    expect(gapsStep?.status).toBe('completed');
    expect(gapsStep?.error).toBeUndefined();

    // Independent verification: the real row count in the real target
    // table matches the real source table's row count.
    const sourceCount = await sharedPool.query('SELECT COUNT(*) FROM public.oc_gaps');
    const targetCount = await sharedPool.query(`SELECT COUNT(*) FROM ${plan.targetSchema}.oc_gaps`);
    expect(targetCount.rows[0].count).toBe(sourceCount.rows[0].count);

    // The generated column itself computed correctly on the target side too —
    // not just copied blindly (it CAN'T be copied — Postgres always
    // recomputes it), proving the fix does not silently lose data
    // integrity for the one column it had to stop copying directly.
    const targetGenerated = await sharedPool.query(
      `SELECT maturity_gap, target_maturity, current_maturity FROM ${plan.targetSchema}.oc_gaps LIMIT 5`,
    );
    for (const row of targetGenerated.rows) {
      expect(row.maturity_gap).toBe(row.target_maturity - row.current_maturity);
    }
  });
});
