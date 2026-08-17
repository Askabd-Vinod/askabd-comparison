/**
 * Real, evidence-backed Engineering Intelligence types and helpers.
 *
 * Backed entirely by the `oc_defects` table (apps/api/src/db/migrations/023_jira_integration.sql)
 * via DefectDetectionService (apps/api/src/services/defect-detection-service.ts), which detects
 * defects from real platform signals (connector failures, discovery failures, migration failures,
 * lifecycle stalls, open security problems) and JiraIntegrationService.recordDefect, which persists
 * them with deduplication.
 *
 * Deliberately does NOT model: numeric RCA "confidence scores" (the real schema only records a
 * categorical root_cause_confidence — confirmed/likely/possible/unknown), alternative root causes
 * with invented probabilities, multi-option "solutions" with advantages/disadvantages, dollar-figure
 * business impact, stack traces, correlation IDs, or "affected pages/components" impact analysis —
 * none of these have a real data source in this platform. Fields the platform cannot compute are
 * surfaced as "Not yet available" / "Not tracked" in the UI, never invented.
 */

export type DefectCategory =
  | 'connector' | 'discovery' | 'migration' | 'lifecycle' | 'security'
  | 'validation' | 'compliance' | 'performance' | 'api' | 'workflow' | 'health';

export type DefectSeverity = 'critical' | 'high' | 'medium' | 'low';

export type DefectStatus = 'detected' | 'acknowledged' | 'investigating' | 'mitigating' | 'resolved' | 'verified' | 'closed';

/** Categorical only — the real schema never stores a numeric confidence percentage. */
export type RootCauseConfidence = 'confirmed' | 'likely' | 'possible' | 'unknown';

/** Maps 1:1 onto a row of oc_defects — no fields added, none renamed to imply more than is stored. */
export interface RealDefect {
  id: string;
  client_id: string | null;
  environment: string;
  category: DefectCategory | string;
  severity: DefectSeverity;
  title: string;
  description: string;
  affected_service: string;
  affected_endpoint: string;
  fingerprint: string;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  root_cause: string;
  root_cause_confidence: RootCauseConfidence | string;
  business_impact: string;
  technical_impact: string;
  status: DefectStatus | string;
  recommended_fix: string;
  resolution: string;
  resolved_at: string | null;
  resolved_by: string;
  evidence?: string[];
  jira_issue_key?: string;
  jira_issue_url?: string;
}

export const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-blue-100 text-blue-700',
};

export const statusColors: Record<string, string> = {
  detected: 'bg-red-100 text-red-700',
  acknowledged: 'bg-blue-100 text-blue-700',
  investigating: 'bg-indigo-100 text-indigo-700',
  mitigating: 'bg-purple-100 text-purple-700',
  resolved: 'bg-green-100 text-green-700',
  verified: 'bg-green-200 text-green-800',
  closed: 'bg-gray-100 text-gray-600',
};

export const confidenceColors: Record<string, string> = {
  confirmed: 'text-green-600',
  likely: 'text-orange-600',
  possible: 'text-gray-500',
  unknown: 'text-gray-300',
};

export const confidenceLabels: Record<string, string> = {
  confirmed: 'Confirmed',
  likely: 'Likely',
  possible: 'Possible',
  unknown: 'Unknown',
};

/** Real, honest metrics derived only from what's actually persisted — no invented composites. */
export interface RealEngineeringMetrics {
  openDefects: number;
  criticalOpen: number;
  highOpen: number;
  recurringIssues: number;
  securityOpen: number;
  resolvedCount: number;
  /** Only computed if at least one defect has been resolved; otherwise null. */
  avgResolutionHours: number | null;
  confidenceDistribution: Record<string, number>;
  topRootCauses: Array<{ cause: string; count: number }>;
  mostImpactedServices: Array<{ service: string; count: number }>;
}

export function computeRealMetrics(defects: RealDefect[]): RealEngineeringMetrics {
  const open = defects.filter(d => d.status !== 'closed' && d.status !== 'resolved' && d.status !== 'verified');
  const resolved = defects.filter(d => d.resolved_at);

  const confidenceDistribution: Record<string, number> = {};
  for (const d of defects) {
    const key = d.root_cause_confidence || 'unknown';
    confidenceDistribution[key] = (confidenceDistribution[key] || 0) + 1;
  }

  const rootCauseCounts = new Map<string, number>();
  for (const d of defects) {
    if (!d.root_cause) continue;
    rootCauseCounts.set(d.root_cause, (rootCauseCounts.get(d.root_cause) || 0) + 1);
  }
  const topRootCauses = [...rootCauseCounts.entries()]
    .map(([cause, count]) => ({ cause, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const serviceCounts = new Map<string, number>();
  for (const d of defects) {
    if (!d.affected_service) continue;
    serviceCounts.set(d.affected_service, (serviceCounts.get(d.affected_service) || 0) + 1);
  }
  const mostImpactedServices = [...serviceCounts.entries()]
    .map(([service, count]) => ({ service, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  let avgResolutionHours: number | null = null;
  if (resolved.length > 0) {
    const totalHours = resolved.reduce((sum, d) => {
      const start = new Date(d.first_seen_at).getTime();
      const end = new Date(d.resolved_at as string).getTime();
      return sum + (end - start) / (1000 * 60 * 60);
    }, 0);
    avgResolutionHours = Math.round((totalHours / resolved.length) * 10) / 10;
  }

  return {
    openDefects: open.length,
    criticalOpen: open.filter(d => d.severity === 'critical').length,
    highOpen: open.filter(d => d.severity === 'high').length,
    recurringIssues: defects.filter(d => d.occurrence_count > 1).length,
    securityOpen: open.filter(d => d.category === 'security').length,
    resolvedCount: resolved.length,
    avgResolutionHours,
    confidenceDistribution,
    topRootCauses,
    mostImpactedServices,
  };
}

export function formatResolutionTime(hours: number | null): string {
  if (hours === null) return 'Not yet available';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${Math.round(hours / 24)} days`;
}
