/**
 * Real, evidence-backed Migration Intelligence types and helpers.
 *
 * Backed entirely by the `oc_migration_runs` table via MigrationExecutionService
 * (apps/api/src/services/migration-execution-service.ts), which performs real
 * PostgreSQL-schema-to-schema migrations: it discovers the source schema's actual
 * tables/indexes/views/sequences, creates a real target schema, copies real rows, and
 * validates the result with real row-count comparisons. Rollback drops the target
 * schema and verifies removal.
 *
 * This is narrower than a general "enterprise migration platform" (no cloud/ERP/CRM/
 * mainframe migration types, no cost or timeline estimation, no skills-gap analysis) —
 * the UI reflects that real, narrower scope rather than implying broader capability.
 * Deliberately does NOT model: cost estimates, effort/timeline estimates, required
 * skills, prose "strategy/approach/communication plans", fabricated gap items, or
 * fabricated wave schedules — none of these have a real data source. What IS real and
 * shown: per-step status/evidence/row counts, mandatory-vs-optional step classification,
 * strict all-mandatory-steps-must-pass completion rules, and real validation checks.
 */

export type MigrationStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'not_supported';
export type MigrationStepType = 'schema' | 'table' | 'index' | 'constraint' | 'view' | 'data' | 'extension' | 'sequence';

export interface MigrationStep {
  id: string;
  name: string;
  type: MigrationStepType;
  object: string;
  mandatory: boolean;
  status: MigrationStepStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  rowsProcessed?: number;
  error?: string;
  resolution?: string;
  attempt: number;
}

export type MigrationRunStatus =
  | 'planning' | 'dry-run' | 'dry-run-failed' | 'ready' | 'approved' | 'running'
  | 'completed' | 'partial' | 'failed' | 'rolled-back' | 'validating' | 'validated' | 'validation-failed';

export interface MigrationPlanSummary {
  tables: number;
  indexes: number;
  views: number;
  constraints: number;
  sequences: number;
  extensions: number;
  totalSteps: number;
  mandatorySteps: number;
}

export interface MigrationProgress {
  completed: number;
  failed: number;
  skipped: number;
  total: number;
  mandatory: number;
  mandatoryCompleted: number;
  mandatoryFailed: number;
  percentage: number;
}

/** Same shape from both GET /oc/migrations (list) and GET /oc/migrations/:id (detail). */
export interface MigrationRun {
  id: string;
  clientId: string;
  sourceSchema: string;
  targetSchema: string;
  status: MigrationRunStatus;
  steps: MigrationStep[];
  plan: MigrationPlanSummary;
  progress: MigrationProgress;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error?: string;
  evidence: string[];
  createdAt: string;
}

export const statusColors: Record<string, string> = {
  planning: 'bg-gray-100 text-gray-700',
  'dry-run': 'bg-blue-100 text-blue-700',
  'dry-run-failed': 'bg-red-100 text-red-700',
  ready: 'bg-green-100 text-green-700',
  approved: 'bg-indigo-100 text-indigo-700',
  running: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-200 text-green-800',
  partial: 'bg-orange-100 text-orange-700',
  failed: 'bg-red-100 text-red-700',
  'rolled-back': 'bg-orange-100 text-orange-700',
  validating: 'bg-indigo-100 text-indigo-700',
  validated: 'bg-green-200 text-green-800',
  'validation-failed': 'bg-red-100 text-red-700',
};

export const stepStatusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-500',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-500',
  not_supported: 'bg-orange-100 text-orange-700',
};

export function formatDuration(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return 'Not yet available';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60000)} min`;
}

export interface PortfolioMetrics {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  inProgressRuns: number;
  avgMandatoryCompletionPercentage: number | null;
}

export function computePortfolioMetrics(runs: MigrationRun[]): PortfolioMetrics {
  const completed = runs.filter(r => r.status === 'completed' || r.status === 'validated');
  const failed = runs.filter(r => r.status === 'failed' || r.status === 'dry-run-failed' || r.status === 'validation-failed');
  const inProgress = runs.filter(r => r.status === 'running' || r.status === 'validating');

  const withProgress = runs.filter(r => r.progress && r.progress.mandatory > 0);
  const avgMandatoryCompletionPercentage = withProgress.length > 0
    ? Math.round(withProgress.reduce((a, r) => a + r.progress.percentage, 0) / withProgress.length)
    : null;

  return {
    totalRuns: runs.length,
    completedRuns: completed.length,
    failedRuns: failed.length,
    inProgressRuns: inProgress.length,
    avgMandatoryCompletionPercentage,
  };
}
