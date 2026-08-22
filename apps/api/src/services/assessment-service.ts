/**
 * AskABD Assessment Service
 * Analyzes discovery results to produce risk, compatibility, and readiness scores.
 * Every finding must reference discovery evidence.
 */

import { randomUUID } from 'node:crypto';
import { sharedPool } from './db-pool.js';

const dbPool = sharedPool;

export interface AssessmentFinding {
  id: string;
  category: 'security' | 'performance' | 'compatibility' | 'risk' | 'technical-debt' | 'complexity';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  evidence: string; // reference to discovery resource
  recommendation: string;
  effort: string;
}

export interface AssessmentResult {
  id: string;
  clientId: string;
  discoveryRunId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  riskScore: number; // 0-100
  complexityScore: number; // 0-100
  findings: AssessmentFinding[];
  summary: { total: number; critical: number; high: number; medium: number; low: number };
  evidence: string[];
  startedAt: string | null;
  completedAt: string | null;
}

export class AssessmentService {

  /**
   * Start an assessment based on a discovery run's results
   */
  async startAssessment(clientId: string, discoveryRunId: string): Promise<AssessmentResult> {
    // randomUUID, not Math.random() — a genuinely collision-safe suffix, not a
    // weak pseudo-random one (found during a fabrication/ID-safety sweep).
    const assessmentId = `assess-${Date.now()}-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const startedAt = new Date().toISOString();

    // Load discovery results
    const discRes = await dbPool.query('SELECT results, status FROM oc_discovery_runs WHERE id = $1 AND client_id = $2', [discoveryRunId, clientId]);
    if (discRes.rows.length === 0 || discRes.rows[0].status !== 'completed') {
      const failed: AssessmentResult = {
        id: assessmentId, clientId, discoveryRunId, status: 'failed',
        riskScore: 0, complexityScore: 0, findings: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        evidence: ['Assessment failed: Discovery run not found or not completed'],
        startedAt, completedAt: startedAt,
      };
      await this.persistAssessment(failed);
      return failed;
    }

    const discoveryData = discRes.rows[0].results;
    const resources = discoveryData?.resources || [];

    // Perform real assessment based on discovery data
    const findings = this.analyzeResources(resources);
    const riskScore = this.calculateRiskScore(findings);
    const complexityScore = this.calculateComplexityScore(resources);

    const summary = {
      total: findings.length,
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
    };

    const completedAt = new Date().toISOString();
    const result: AssessmentResult = {
      id: assessmentId, clientId, discoveryRunId, status: 'completed',
      riskScore, complexityScore, findings, summary,
      evidence: [
        `Assessment completed at ${completedAt}`,
        `Resources analyzed: ${resources.length}`,
        `Findings: ${findings.length} (${summary.critical} critical, ${summary.high} high)`,
        `Risk score: ${riskScore}/100`,
        `Complexity score: ${complexityScore}/100`,
      ],
      startedAt, completedAt,
    };

    await this.persistAssessment(result);
    return result;
  }

  /**
   * Analyze discovered resources and generate evidence-based findings
   */
  private analyzeResources(resources: any[]): AssessmentFinding[] {
    const findings: AssessmentFinding[] = [];
    let findingIdx = 0;

    // Analyze PostgreSQL version
    const serverRes = resources.find((r: any) => r.type === 'server');
    if (serverRes?.metadata?.version) {
      const version = serverRes.metadata.version;
      const majorVersion = parseInt(version.match(/PostgreSQL (\d+)/)?.[1] || '0');
      if (majorVersion > 0 && majorVersion < 14) {
        findings.push({ id: `f-${++findingIdx}`, category: 'security', severity: 'high', title: 'PostgreSQL version outdated', description: `Running PostgreSQL ${majorVersion}. Versions below 14 have known security vulnerabilities and are approaching end-of-life.`, evidence: `Discovery: server ${serverRes.name} version ${version}`, recommendation: 'Upgrade to PostgreSQL 15 or 16 for security patches and performance improvements', effort: '2-4 hours' });
      } else if (majorVersion >= 14) {
        findings.push({ id: `f-${++findingIdx}`, category: 'security', severity: 'info', title: 'PostgreSQL version current', description: `Running PostgreSQL ${majorVersion}. This version is actively maintained.`, evidence: `Discovery: server ${serverRes.name}`, recommendation: 'No action required. Continue monitoring for updates.', effort: 'None' });
      }
    }

    // Analyze table count
    const tables = resources.filter((r: any) => r.type === 'table');
    if (tables.length > 50) {
      findings.push({ id: `f-${++findingIdx}`, category: 'complexity', severity: 'medium', title: 'Large database schema', description: `${tables.length} tables discovered. Complex schemas increase migration risk and require careful dependency mapping.`, evidence: `Discovery: ${tables.length} tables across schemas`, recommendation: 'Create detailed table dependency map before migration. Consider phased migration approach.', effort: '1-2 days' });
    }

    // Analyze missing indexes (tables without associated indexes)
    const indexes = resources.filter((r: any) => r.type === 'index');
    const tablesWithIndexes = new Set(indexes.map((i: any) => i.metadata?.table));
    const tablesWithoutIndexes = tables.filter((t: any) => !tablesWithIndexes.has(t.name.split('.')[1]));
    if (tablesWithoutIndexes.length > 0 && tables.length > 0) {
      const ratio = Math.round((tablesWithoutIndexes.length / tables.length) * 100);
      if (ratio > 30) {
        findings.push({ id: `f-${++findingIdx}`, category: 'performance', severity: 'medium', title: 'Tables without indexes', description: `${tablesWithoutIndexes.length} of ${tables.length} tables (${ratio}%) have no custom indexes. This may indicate performance issues under load.`, evidence: `Discovery: ${tablesWithoutIndexes.length} tables without indexes`, recommendation: 'Review query patterns and add indexes for frequently accessed columns.', effort: '2-5 days' });
      }
    }

    // Analyze extensions
    const extensions = resources.filter((r: any) => r.type === 'extension');
    if (extensions.length > 0) {
      findings.push({ id: `f-${++findingIdx}`, category: 'compatibility', severity: 'info', title: 'Database extensions in use', description: `${extensions.length} PostgreSQL extensions detected: ${extensions.map((e: any) => e.name).join(', ')}. Extensions must be available on target during migration.`, evidence: `Discovery: extensions ${extensions.map((e: any) => e.name).join(', ')}`, recommendation: 'Verify all extensions are available and compatible on the target platform.', effort: '1 hour' });
    }

    // Analyze schemas
    const schemas = resources.filter((r: any) => r.type === 'schema');
    if (schemas.length > 3) {
      findings.push({ id: `f-${++findingIdx}`, category: 'complexity', severity: 'low', title: 'Multiple schemas', description: `${schemas.length} schemas detected. Multi-schema databases require schema-aware migration.`, evidence: `Discovery: schemas ${schemas.map((s: any) => s.name).join(', ')}`, recommendation: 'Plan migration per-schema or ensure schema creation order respects dependencies.', effort: '2-4 hours' });
    }

    // GitHub repositories analysis
    const repos = resources.filter((r: any) => r.type === 'repository');
    if (repos.length > 0) {
      const outdated = repos.filter((r: any) => {
        const updated = new Date(r.metadata?.updatedAt || '');
        const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
        return updated < sixMonthsAgo;
      });
      if (outdated.length > 0) {
        findings.push({ id: `f-${++findingIdx}`, category: 'technical-debt', severity: 'low', title: 'Stale repositories', description: `${outdated.length} repositories not updated in 6+ months. May contain outdated dependencies.`, evidence: `Discovery: ${outdated.length} repos inactive`, recommendation: 'Review and archive unused repositories. Update dependencies in active ones.', effort: '1-2 days' });
      }
    }

    return findings;
  }

  private calculateRiskScore(findings: AssessmentFinding[]): number {
    let score = 0;
    for (const f of findings) {
      switch (f.severity) {
        case 'critical': score += 25; break;
        case 'high': score += 15; break;
        case 'medium': score += 8; break;
        case 'low': score += 3; break;
        default: score += 0;
      }
    }
    return Math.min(100, score);
  }

  private calculateComplexityScore(resources: any[]): number {
    const tables = resources.filter((r: any) => r.type === 'table').length;
    const schemas = resources.filter((r: any) => r.type === 'schema').length;
    const repos = resources.filter((r: any) => r.type === 'repository').length;
    return Math.min(100, Math.round((tables * 1.5) + (schemas * 5) + (repos * 2)));
  }

  async getAssessments(clientId: string): Promise<any[]> {
    try {
      const res = await dbPool.query('SELECT * FROM oc_assessments WHERE client_id = $1 ORDER BY created_at DESC LIMIT 10', [clientId]);
      return res.rows;
    } catch { return []; }
  }

  private async persistAssessment(result: AssessmentResult): Promise<void> {
    try {
      await dbPool.query(`
        INSERT INTO oc_assessments (id, client_id, discovery_run_id, status, risk_score, complexity_score, findings, risks, recommendations, evidence, started_at, completed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [result.id, result.clientId, result.discoveryRunId, result.status, result.riskScore, result.complexityScore, JSON.stringify(result.findings), JSON.stringify(result.findings.filter(f => f.category === 'risk')), JSON.stringify(result.findings.filter(f => f.recommendation)), result.evidence, result.startedAt, result.completedAt]);
    } catch (err) {
      console.error('Failed to persist assessment:', (err as Error).message);
    }
  }
}
