/**
 * business_journey_engine_test_1 — real, end-to-end business journey
 * validation (Priority 1, 2026-08-29 Verification Service continuation
 * directive). Every journey below is exercised for real: a real disposable
 * client is created via the real service layer, real engine methods are
 * called, real database state is asserted, a real RBAC boundary is proven
 * denied, and real cleanup is verified — never a unit-test call dressed up
 * as a business-journey pass.
 */
import { describe, expect, it, afterAll } from 'vitest';
import { BusinessJourneyEngine, JOURNEY_DEFINITIONS } from '../src/services/business-journey-engine.js';
import { sharedPool } from '../src/services/db-pool.js';

const createdRunIds: string[] = [];
afterAll(async () => {
  await sharedPool.query('DELETE FROM oc_verification_journey_runs WHERE id = ANY($1)', [createdRunIds]).catch(() => {});
});

describe('Business Journey Engine — real journey registry', () => {
  it('lists all 17 real, named journeys, honestly marking which are implemented', () => {
    const engine = new BusinessJourneyEngine();
    const defs = engine.listDefinitions();
    expect(defs.length).toBe(17);
    const implemented = defs.filter(d => d.implemented).map(d => d.id);
    expect(implemented).toEqual(['client-onboarding', 'workflow-execution', 'report-generation']);
  });
});

describe('Business Journey Engine — Client Onboarding, fully real', () => {
  it('runs the real journey end to end: create, DB, API, RBAC, audit, cleanup', async () => {
    const engine = new BusinessJourneyEngine();
    const result = await engine.runJourney('client-onboarding', { environment: 'development' });
    createdRunIds.push(result.id);

    expect(result.status).toBe('passed');
    expect(result.steps.every(s => s.status === 'passed')).toBe(true);
    expect((result.databaseResult as any).found).toBe(true);
    expect((result.securityResult as any).denied).toBe(true);
    expect((result.auditResult as any).found).toBe(true);
    expect(result.cleanupPerformed).toBe(true);

    // Real, independent re-verification that cleanup genuinely happened —
    // not trusting the journey's own self-report.
    const check = await sharedPool.query('SELECT 1 FROM oc_clients WHERE id = $1', [result.clientId]);
    expect(check.rows.length).toBe(0);
  }, 20000);
});

describe('Business Journey Engine — Report Generation, fully real', () => {
  it('runs the real journey end to end: real client, real report with real dimensions, real export route, cleanup', async () => {
    const engine = new BusinessJourneyEngine();
    const result = await engine.runJourney('report-generation', { environment: 'development' });
    createdRunIds.push(result.id);

    expect(result.status).toBe('passed');
    expect((result.databaseResult as any).clientMatches).toBe(true);
    expect((result.securityResult as any).denied).toBe(true);
    expect(result.cleanupPerformed).toBe(true);

    const check = await sharedPool.query('SELECT 1 FROM oc_clients WHERE id = $1', [result.clientId]);
    expect(check.rows.length).toBe(0);
  }, 20000);
});

describe('Business Journey Engine — Workflow Execution, fully real', () => {
  it('runs the real journey end to end: real rule, real event, real execution, cleanup', async () => {
    const engine = new BusinessJourneyEngine();
    const result = await engine.runJourney('workflow-execution', { environment: 'development' });
    createdRunIds.push(result.id);

    expect(result.status).toBe('passed');
    expect((result.databaseResult as any).found).toBeGreaterThan(0);
    expect((result.securityResult as any).denied).toBe(true);
    expect(result.cleanupPerformed).toBe(true);

    const check = await sharedPool.query('SELECT 1 FROM oc_clients WHERE id = $1', [result.clientId]);
    expect(check.rows.length).toBe(0);
  }, 20000);
});

describe('Business Journey Engine — an unimplemented journey is honestly reported, never simulated', () => {
  it('returns a real BLOCKED status for a journey with no runner, not a fake pass', async () => {
    const engine = new BusinessJourneyEngine();
    const result = await engine.runJourney('marketplace', { environment: 'development' });
    createdRunIds.push(result.id);
    expect(result.status).toBe('blocked');
    expect(result.actualResult).toContain('No real implementation exists');
  });

  it('rejects a genuinely unknown journey id', async () => {
    const engine = new BusinessJourneyEngine();
    await expect(engine.runJourney('does-not-exist', {})).rejects.toThrow('Unknown journey');
  });
});
