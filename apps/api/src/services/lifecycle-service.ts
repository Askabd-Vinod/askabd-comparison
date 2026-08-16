/**
 * AskABD Server-Side Lifecycle Service
 * PostgreSQL is the authoritative source of truth.
 * Uses the canonical lifecycle status and transition rules.
 */

import { sharedPool } from './db-pool.js';

const dbPool = sharedPool;

// Canonical statuses and transitions (same as frontend — single definition)
const validTransitions: Record<string, { from: string; to: string }> = {
  'organization_created': { from: 'organization-created', to: 'otp-sent' },
  'otp_verified': { from: 'otp-sent', to: 'otp-verified' },
  'identity_verified': { from: 'otp-verified', to: 'identity-verified' },
  'security_validated': { from: 'identity-verified', to: 'security-validated' },
  'environment_registered': { from: 'security-validated', to: 'environment-registered' },
  'connectors_configured': { from: 'environment-registered', to: 'connectors-configured' },
  'discovery_started': { from: 'connectors-configured', to: 'discovery-running' },
  'discovery_completed': { from: 'discovery-running', to: 'discovery-complete' },
  'assessment_started': { from: 'discovery-complete', to: 'assessment-running' },
  'assessment_completed': { from: 'assessment-running', to: 'assessment-complete' },
  'recommendations_generated': { from: 'assessment-complete', to: 'recommendations-generated' },
  'migration_plan_created': { from: 'recommendations-generated', to: 'migration-planning' },
  'migration_approved': { from: 'migration-planning', to: 'migration-approved' },
  'migration_started': { from: 'migration-approved', to: 'migration-running' },
  'migration_completed': { from: 'migration-running', to: 'migration-complete' },
  'validation_started': { from: 'migration-complete', to: 'validation-running' },
  'validation_passed': { from: 'validation-running', to: 'validation-passed' },
  'audit_started': { from: 'validation-passed', to: 'audit-running' },
  'audit_passed': { from: 'audit-running', to: 'audit-passed' },
  'go_live': { from: 'audit-passed', to: 'go-live' },
  'hyper_care_started': { from: 'go-live', to: 'hyper-care' },
  'managed_services_active': { from: 'hyper-care', to: 'managed-services' },
  'monitoring_active': { from: 'managed-services', to: 'continuous-monitoring' },
  'engineering_active': { from: 'continuous-monitoring', to: 'engineering-intelligence' },
};

// Map lifecycle statuses to their corresponding service IDs for readiness checks
const statusToServiceId: Record<string, string | null> = {
  'organization-created': null, // No service requirements for this stage
  'otp-sent': null,
  'otp-verified': 'identity-verification',
  'identity-verified': 'security-validation',
  'security-validated': 'environment-registration',
  'environment-registered': 'connector-configuration',
  'connectors-configured': 'discovery',
  'discovery-running': null, // Automatic — no client requirements during execution
  'discovery-complete': null,
  'assessment-running': null,
  'assessment-complete': null,
  'recommendations-generated': null,
  'migration-planning': null,
  'migration-approved': null,
  'migration-running': null,
  'migration-complete': null,
  'validation-running': null,
  'validation-passed': null,
  'audit-running': null,
  'audit-passed': null,
  'go-live': null,
  'hyper-care': null,
  'managed-services': null,
  'continuous-monitoring': null,
  'engineering-intelligence': null,
};

export interface LifecycleRecord {
  clientId: string;
  status: string;
  previousStatus: string | null;
  events: any[];
  version: number;
  updatedAt: string;
  createdAt: string;
}

export class LifecycleService {

  async getLifecycle(clientId: string): Promise<LifecycleRecord | null> {
    try {
      const res = await dbPool.query('SELECT * FROM oc_lifecycle WHERE client_id = $1', [clientId]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        clientId: row.client_id, status: row.status,
        previousStatus: row.previous_status, events: row.events || [],
        version: row.version || 1, updatedAt: row.updated_at, createdAt: row.created_at,
      };
    } catch { return null; }
  }

  async initializeLifecycle(clientId: string, initialStatus: string = 'organization-created'): Promise<LifecycleRecord> {
    const now = new Date().toISOString();
    const events = [{ event: 'lifecycle_initialized', timestamp: now, actor: 'system', fromStatus: 'contract', toStatus: initialStatus }];

    await dbPool.query(`
      INSERT INTO oc_lifecycle (client_id, status, previous_status, events, version, updated_at, created_at)
      VALUES ($1, $2, 'contract', $3, 1, NOW(), NOW())
      ON CONFLICT (client_id) DO NOTHING
    `, [clientId, initialStatus, JSON.stringify(events)]);

    return { clientId, status: initialStatus, previousStatus: 'contract', events, version: 1, updatedAt: now, createdAt: now };
  }

  async transition(clientId: string, event: string, actor: string, details?: string, skipReadiness: boolean = false, actorType: string = 'user'): Promise<{ success: boolean; lifecycle?: LifecycleRecord; error?: string; readiness?: any }> {
    const transition = validTransitions[event];
    if (!transition) return { success: false, error: `Unknown event: ${event}` };

    // Load current state
    const current = await this.getLifecycle(clientId);
    if (!current) return { success: false, error: 'Lifecycle not found. Initialize first.' };

    // Validate current status matches transition.from
    if (current.status !== transition.from) {
      return { success: false, error: `Cannot apply "${event}": current status is "${current.status}", expected "${transition.from}"` };
    }

    // SECURITY: skipReadiness is ONLY honored for trusted system actors.
    // Frontend/user requests CANNOT bypass readiness even if they send skipReadiness=true.
    const trustedActorTypes = ['system', 'engine', 'automatic', 'internal'];
    const isTrustedSystem = trustedActorTypes.includes((actorType || 'user').toLowerCase());
    const canSkipReadiness = skipReadiness && isTrustedSystem;

    // SERVICE READINESS GATE
    if (!canSkipReadiness) {
      const serviceId = statusToServiceId[current.status];
      if (serviceId) {
        try {
          const { RequirementsService } = await import('./requirements-service.js');
          const reqService = new RequirementsService();
          const readiness = await reqService.getReadiness(clientId, serviceId);
          if (readiness.status === 'blocked' && readiness.blockers.length > 0) {
            return {
              success: false,
              error: 'lifecycle_prerequisites_not_met',
              readiness: {
                status: readiness.status,
                service: { id: serviceId },
                currentStatus: current.status,
                targetStatus: transition.to,
                blockers: readiness.blockers,
                nextAction: readiness.nextAction,
                documents: readiness.documents,
                requiredProvided: readiness.requiredProvided,
                required: readiness.required,
              },
            };
          }
        } catch { /* If readiness service unavailable, allow transition (graceful degradation) */ }
      }
    }

    // Execute transition with optimistic locking
    const newEvent = { event, timestamp: new Date().toISOString(), actor, details, fromStatus: transition.from, toStatus: transition.to };
    const newEvents = [...current.events, newEvent];

    const res = await dbPool.query(`
      UPDATE oc_lifecycle SET status = $1, previous_status = $2, events = $3, version = version + 1, updated_at = NOW()
      WHERE client_id = $4 AND version = $5
      RETURNING *
    `, [transition.to, transition.from, JSON.stringify(newEvents), clientId, current.version]);

    if (res.rows.length === 0) {
      return { success: false, error: 'Concurrent modification detected. Reload and retry.' };
    }

    const row = res.rows[0];

    // ─── AUTO-EMIT PLATFORM EVENT (non-blocking) ────────────────────────────
    this.emitLifecycleEvent(clientId, event, transition.from, transition.to, actor, actorType).catch(() => {});

    return {
      success: true,
      lifecycle: { clientId: row.client_id, status: row.status, previousStatus: row.previous_status, events: row.events || newEvents, version: row.version, updatedAt: row.updated_at, createdAt: row.created_at },
    };
  }

  /** Emit LIFECYCLE_CHANGED event into workflow automation (non-blocking) */
  private async emitLifecycleEvent(clientId: string, event: string, fromStatus: string, toStatus: string, actor: string, actorType: string): Promise<void> {
    try {
      const { WorkflowAutomationService } = await import('./workflow-automation-service.js');
      const wf = new WorkflowAutomationService();
      await wf.emitEvent({
        eventType: 'LIFECYCLE_CHANGED', clientId, entityType: 'lifecycle', entityId: clientId,
        entityName: toStatus, actor, actorType, severity: 'info',
        payload: { event, fromStatus, toStatus },
        idempotencyKey: `lifecycle-${clientId}-${event}-${Date.now()}`,
      });
    } catch { /* non-blocking — workflow failure must not break lifecycle */ }
  }

  async getHistory(clientId: string): Promise<any[]> {
    const lc = await this.getLifecycle(clientId);
    return lc?.events || [];
  }
}
