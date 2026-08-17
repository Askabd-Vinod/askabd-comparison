/**
 * Engineering defects — GET /oc/defects/:defectId
 *
 * Verifies: the single-defect fetch returns the real oc_defects row (evidence,
 * root_cause, root_cause_confidence as recorded — no fabricated fields added by
 * the route), 404s honestly for an unknown id, and dedup-by-fingerprint still
 * works through the real JiraIntegrationService.recordDefect path this route reads from.
 */
import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { JiraIntegrationService } from '../src/services/jira-integration-service.js';
import { sharedPool } from '../src/services/db-pool.js';

let app: ReturnType<typeof Fastify>;
const createdDefectIds: string[] = [];

beforeAll(async () => {
  app = Fastify();
  await app.register(operationsCenterRoutes);
  await app.ready();
});

afterAll(async () => {
  for (const id of createdDefectIds) {
    await sharedPool.query('DELETE FROM oc_defects WHERE id = $1', [id]).catch(() => {});
  }
  await app.close();
});

describe('GET /oc/defects/:defectId', () => {
  it('returns the real recorded defect with its actual evidence and root-cause-confidence — nothing fabricated', async () => {
    const jira = new JiraIntegrationService();
    const result = await jira.recordDefect({
      category: 'connector',
      severity: 'high',
      title: 'Defects Route Test — Connector failed',
      description: 'Test-only defect for route verification',
      affectedService: 'connector-service',
      rootCause: 'Connection validation failed',
      rootCauseConfidence: 'likely',
      businessImpact: 'Discovery blocked for this client.',
      evidence: ['Provider: test-provider', 'Status: failed'],
    });
    createdDefectIds.push(result.id);

    const res = await app.inject({ method: 'GET', url: `/oc/defects/${result.id}` });
    expect(res.statusCode).toBe(200);
    const { defect } = res.json();
    expect(defect.id).toBe(result.id);
    expect(defect.title).toBe('Defects Route Test — Connector failed');
    expect(defect.root_cause_confidence).toBe('likely'); // categorical, not a fabricated percentage
    expect(defect.evidence).toEqual(['Provider: test-provider', 'Status: failed']);
    expect(defect.occurrence_count).toBe(1);
  });

  it('404s honestly for an id that does not exist, rather than returning a fabricated placeholder', async () => {
    const res = await app.inject({ method: 'GET', url: '/oc/defects/def-does-not-exist' });
    expect(res.statusCode).toBe(404);
  });

  it('recording the same defect twice increments occurrence_count instead of creating a duplicate', async () => {
    const jira = new JiraIntegrationService();
    const first = await jira.recordDefect({
      category: 'discovery',
      severity: 'medium',
      title: 'Defects Route Test — Duplicate Detection',
      affectedService: 'discovery-service',
    });
    createdDefectIds.push(first.id);
    const second = await jira.recordDefect({
      category: 'discovery',
      severity: 'medium',
      title: 'Defects Route Test — Duplicate Detection',
      affectedService: 'discovery-service',
    });

    expect(second.id).toBe(first.id);
    expect(second.isNew).toBe(false);

    const res = await app.inject({ method: 'GET', url: `/oc/defects/${first.id}` });
    const { defect } = res.json();
    expect(defect.occurrence_count).toBe(2);
  });
});
