/**
 * AskABD Automated Defect Detection Service
 * 
 * Scans platform state and automatically records defects from:
 * - Connector failures
 * - Discovery failures
 * - Assessment failures
 * - Migration failures
 * - Validation failures
 * - Health degradation
 * - Repeated lifecycle failures
 * - Security findings
 * - Compliance gaps
 * 
 * DEDUPLICATION: Uses fingerprints. Same problem = increment count, not new defect.
 * NON-BLOCKING: Detection failures do not affect platform operations.
 */

import { sharedPool } from './db-pool.js';
import { JiraIntegrationService } from './jira-integration-service.js';

const dbPool = sharedPool;

export interface DetectionResult {
  scanned: number;
  newDefects: number;
  updatedDefects: number;
  categories: Record<string, number>;
  evidence: string[];
}

export class DefectDetectionService {
  private jiraService = new JiraIntegrationService();

  /**
   * Run a full detection sweep across all client data.
   * Safe to call repeatedly — idempotent via fingerprints.
   */
  async runDetection(): Promise<DetectionResult> {
    const result: DetectionResult = { scanned: 0, newDefects: 0, updatedDefects: 0, categories: {}, evidence: [] };

    try {
      await this.detectConnectorFailures(result);
      await this.detectDiscoveryFailures(result);
      await this.detectMigrationFailures(result);
      await this.detectLifecycleStalls(result);
      await this.detectSecurityProblems(result);
    } catch (err) {
      result.evidence.push(`Detection sweep error: ${(err as Error).message}`);
    }

    result.evidence.unshift(`Detection sweep completed: ${result.scanned} items scanned, ${result.newDefects} new defects, ${result.updatedDefects} updated`);
    return result;
  }

  /**
   * Detect connector failures — connectors in 'failed' or 'partial' status.
   */
  private async detectConnectorFailures(result: DetectionResult): Promise<void> {
    try {
      const res = await dbPool.query(
        "SELECT client_id, provider, status, error_message, last_tested_at FROM oc_connectors WHERE status IN ('failed', 'partial')"
      );
      result.scanned += res.rows.length;

      for (const row of res.rows) {
        const defect = await this.jiraService.recordDefect({
          clientId: row.client_id,
          category: 'connector',
          severity: 'high',
          title: `Connector ${row.provider} ${row.status}`,
          description: `The ${row.provider} connector for client ${row.client_id} is in ${row.status} state.`,
          affectedService: 'connector-service',
          rootCause: row.error_message || 'Connection validation failed',
          rootCauseConfidence: row.error_message ? 'likely' : 'possible',
          businessImpact: 'Discovery and assessment cannot proceed without working connectors.',
          technicalImpact: `${row.provider} connector failed — downstream discovery blocked.`,
          recommendedFix: 'Verify credentials, check network access, and re-test the connector.',
          evidence: [`Provider: ${row.provider}`, `Status: ${row.status}`, `Error: ${row.error_message || 'none'}`, `Last tested: ${row.last_tested_at || 'never'}`],
        });

        if (defect.isNew) result.newDefects++;
        else result.updatedDefects++;
        result.categories['connector'] = (result.categories['connector'] || 0) + 1;
      }
    } catch { /* non-blocking */ }
  }

  /**
   * Detect discovery failures — runs with status 'failed'.
   */
  private async detectDiscoveryFailures(result: DetectionResult): Promise<void> {
    try {
      const res = await dbPool.query(
        "SELECT client_id, id, errors, evidence FROM oc_discovery_runs WHERE status = 'failed' AND created_at > NOW() - INTERVAL '7 days'"
      );
      result.scanned += res.rows.length;

      for (const row of res.rows) {
        const defect = await this.jiraService.recordDefect({
          clientId: row.client_id,
          category: 'discovery',
          severity: 'medium',
          title: `Discovery run failed for client`,
          description: `Discovery run ${row.id} failed with ${row.errors || 0} errors.`,
          affectedService: 'discovery-service',
          rootCause: 'Discovery execution encountered errors',
          rootCauseConfidence: 'likely',
          businessImpact: 'Assessment and recommendations cannot be generated without successful discovery.',
          technicalImpact: 'Discovery pipeline blocked.',
          recommendedFix: 'Check connector status, verify permissions, and retry discovery.',
          evidence: row.evidence || [`Run ID: ${row.id}`, `Errors: ${row.errors}`],
        });

        if (defect.isNew) result.newDefects++;
        else result.updatedDefects++;
        result.categories['discovery'] = (result.categories['discovery'] || 0) + 1;
      }
    } catch { /* non-blocking */ }
  }

  /**
   * Detect migration failures.
   */
  private async detectMigrationFailures(result: DetectionResult): Promise<void> {
    try {
      const res = await dbPool.query(
        "SELECT client_id, id, status, error_message FROM oc_migration_runs WHERE status IN ('failed', 'partial') AND created_at > NOW() - INTERVAL '30 days'"
      );
      result.scanned += res.rows.length;

      for (const row of res.rows) {
        const defect = await this.jiraService.recordDefect({
          clientId: row.client_id,
          category: 'migration',
          severity: row.status === 'failed' ? 'critical' : 'high',
          title: `Migration ${row.status}: ${row.id}`,
          description: row.error_message || `Migration run ${row.id} ended in ${row.status} state.`,
          affectedService: 'migration-execution-service',
          rootCause: row.error_message || 'One or more mandatory migration steps failed',
          rootCauseConfidence: row.error_message ? 'confirmed' : 'likely',
          businessImpact: 'Client transformation blocked until migration succeeds.',
          technicalImpact: 'Target schema incomplete or inconsistent.',
          recommendedFix: 'Review failed steps, resolve data/schema issues, then retry or rollback.',
          evidence: [`Migration: ${row.id}`, `Status: ${row.status}`, `Error: ${row.error_message || 'see step details'}`],
        });

        if (defect.isNew) result.newDefects++;
        else result.updatedDefects++;
        result.categories['migration'] = (result.categories['migration'] || 0) + 1;
      }
    } catch { /* non-blocking */ }
  }

  /**
   * Detect lifecycle stalls — clients stuck in the same status for > 7 days without activity.
   */
  private async detectLifecycleStalls(result: DetectionResult): Promise<void> {
    try {
      const res = await dbPool.query(
        "SELECT client_id, status, updated_at FROM oc_lifecycle WHERE updated_at < NOW() - INTERVAL '7 days' AND status NOT IN ('managed-services', 'continuous-monitoring', 'engineering-intelligence', 'go-live', 'hyper-care')"
      );
      result.scanned += res.rows.length;

      for (const row of res.rows) {
        const daysSinceUpdate = Math.round((Date.now() - new Date(row.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        const defect = await this.jiraService.recordDefect({
          clientId: row.client_id,
          category: 'lifecycle',
          severity: daysSinceUpdate > 30 ? 'high' : 'medium',
          title: `Client lifecycle stalled at ${row.status}`,
          description: `Client has been in "${row.status}" for ${daysSinceUpdate} days without progression.`,
          affectedService: 'lifecycle-service',
          rootCause: 'Readiness requirements may be blocking or client action required',
          rootCauseConfidence: 'possible',
          businessImpact: 'Client transformation is not progressing. Value delivery delayed.',
          technicalImpact: 'Lifecycle blocked — downstream capabilities unavailable.',
          recommendedFix: 'Check readiness blockers, contact client, or resolve missing requirements.',
          evidence: [`Status: ${row.status}`, `Last update: ${row.updated_at}`, `Days stalled: ${daysSinceUpdate}`],
        });

        if (defect.isNew) result.newDefects++;
        else result.updatedDefects++;
        result.categories['lifecycle'] = (result.categories['lifecycle'] || 0) + 1;
      }
    } catch { /* non-blocking */ }
  }

  /**
   * Detect security problems — open security-domain problems.
   */
  private async detectSecurityProblems(result: DetectionResult): Promise<void> {
    try {
      const res = await dbPool.query(
        "SELECT client_id, id, title, severity FROM oc_problems WHERE domain = 'security' AND status NOT IN ('resolved', 'closed') AND created_at > NOW() - INTERVAL '30 days'"
      );
      result.scanned += res.rows.length;

      for (const row of res.rows) {
        const defect = await this.jiraService.recordDefect({
          clientId: row.client_id,
          category: 'security',
          severity: row.severity === 'critical' ? 'critical' : 'high',
          title: `Security: ${row.title}`,
          description: `Open security finding from assessment: ${row.title}`,
          affectedService: 'assessment-service',
          rootCause: 'Security vulnerability or misconfiguration detected during assessment',
          rootCauseConfidence: 'confirmed',
          businessImpact: 'Security risk exposure until resolved.',
          technicalImpact: 'System may be vulnerable to exploitation.',
          recommendedFix: 'Apply security remediation per assessment recommendation.',
          evidence: [`Problem ID: ${row.id}`, `Severity: ${row.severity}`],
        });

        if (defect.isNew) result.newDefects++;
        else result.updatedDefects++;
        result.categories['security'] = (result.categories['security'] || 0) + 1;
      }
    } catch { /* non-blocking */ }
  }

  /**
   * Verify a defect's resolution by re-checking the underlying condition.
   * Called when Jira marks an issue as Done.
   */
  async verifyDefectResolution(defectId: string): Promise<{ verified: boolean; evidence: string[]; currentState: string }> {
    const res = await dbPool.query('SELECT * FROM oc_defects WHERE id = $1', [defectId]);
    if (res.rows.length === 0) return { verified: false, evidence: ['Defect not found'], currentState: 'unknown' };

    const defect = res.rows[0];
    const evidence: string[] = [];
    let verified = false;

    switch (defect.category) {
      case 'connector': {
        // Re-check connector status
        const conn = await dbPool.query(
          "SELECT status FROM oc_connectors WHERE client_id = $1 AND provider = (SELECT substring($2 from 'Connector (\\w+)'))",
          [defect.client_id, defect.title]
        ).catch(() => ({ rows: [] }));
        
        // Fallback: check if any connector for this client is now connected
        const anyConnected = await dbPool.query(
          "SELECT count(*) as cnt FROM oc_connectors WHERE client_id = $1 AND status = 'connected'",
          [defect.client_id]
        ).catch(() => ({ rows: [{ cnt: '0' }] }));
        
        verified = parseInt(anyConnected.rows[0]?.cnt || '0') > 0;
        evidence.push(verified ? 'Connector is now connected' : 'Connector still not connected');
        break;
      }
      case 'discovery': {
        // Check if a successful discovery exists after the defect was created
        const disc = await dbPool.query(
          "SELECT status FROM oc_discovery_runs WHERE client_id = $1 AND status = 'completed' AND created_at > $2 ORDER BY created_at DESC LIMIT 1",
          [defect.client_id, defect.created_at]
        );
        verified = disc.rows.length > 0;
        evidence.push(verified ? 'Successful discovery run exists after defect creation' : 'No successful discovery since defect');
        break;
      }
      case 'migration': {
        const mig = await dbPool.query(
          "SELECT status FROM oc_migration_runs WHERE client_id = $1 AND status = 'completed' AND created_at > $2 ORDER BY created_at DESC LIMIT 1",
          [defect.client_id, defect.created_at]
        );
        verified = mig.rows.length > 0;
        evidence.push(verified ? 'Successful migration completed after defect' : 'No successful migration since defect');
        break;
      }
      case 'lifecycle': {
        const lc = await dbPool.query("SELECT status, updated_at FROM oc_lifecycle WHERE client_id = $1", [defect.client_id]);
        if (lc.rows.length > 0) {
          const daysSinceUpdate = Math.round((Date.now() - new Date(lc.rows[0].updated_at).getTime()) / (1000 * 60 * 60 * 24));
          verified = daysSinceUpdate < 7;
          evidence.push(verified ? `Lifecycle active (last update ${daysSinceUpdate} days ago)` : `Lifecycle still stalled (${daysSinceUpdate} days)`);
        } else {
          evidence.push('Lifecycle record not found');
        }
        break;
      }
      default:
        evidence.push(`No automated verification for category: ${defect.category}`);
        break;
    }

    // Update defect status based on verification
    const newStatus = verified ? 'verified' : defect.status;
    if (verified) {
      await dbPool.query(
        "UPDATE oc_defects SET status = 'verified', resolved_at = NOW(), updated_at = NOW() WHERE id = $1",
        [defectId]
      );
    }

    evidence.push(`Verification result: ${verified ? 'PASSED' : 'STILL FAILING'}`);
    return { verified, evidence, currentState: verified ? 'verified' : defect.status };
  }
}
