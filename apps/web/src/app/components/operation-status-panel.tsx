/*  */'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { LifecycleStatus } from '../lib/onboarding-lifecycle';

interface Props { clientId: string; status: LifecycleStatus }

interface OpInfo {
  title: string; description: string; type: 'processing' | 'completed' | 'ongoing';
  apiPath?: string; nextLabel: string; nextRoute: string;
}

const stageConfig: Partial<Record<LifecycleStatus, OpInfo>> = {
  'discovery-running': { title: 'Discovery', description: 'AskABD is scanning the environment (read-only).', type: 'processing', apiPath: '/api/v1/oc/discovery/', nextLabel: 'View Discovery Progress', nextRoute: '/discovery' },
  'discovery-complete': { title: 'Discovery Complete', description: 'Environment has been mapped. Ready for assessment.', type: 'completed', apiPath: '/api/v1/oc/discovery/', nextLabel: 'Start Assessment', nextRoute: '/assessment' },
  'assessment-running': { title: 'Assessment', description: 'AskABD is analyzing risks, compatibility, and readiness.', type: 'processing', apiPath: '/api/v1/oc/assessment/', nextLabel: 'View Assessment Progress', nextRoute: '/assessment' },
  'assessment-complete': { title: 'Assessment Complete', description: 'Analysis complete. Findings and recommendations available.', type: 'completed', apiPath: '/api/v1/oc/assessment/', nextLabel: 'Review Assessment', nextRoute: '/assessment' },
  'recommendations-generated': { title: 'Recommendations Ready', description: 'AI-powered recommendations generated from assessment findings.', type: 'completed', nextLabel: 'Review Recommendations', nextRoute: '/recommendations' },
  'migration-planning': { title: 'Migration Planning', description: 'Migration plan is being prepared based on discovery and assessment.', type: 'processing', nextLabel: 'Review Migration Plan', nextRoute: '/migrations' },
  'migration-approved': { title: 'Migration Approved', description: 'Customer approved the migration plan. Ready for execution.', type: 'completed', nextLabel: 'Execute Migration', nextRoute: '/migrations' },
  'migration-running': { title: 'Migration Running', description: 'Data migration is in progress.', type: 'processing', nextLabel: 'View Migration Progress', nextRoute: '/migrations' },
  'migration-complete': { title: 'Migration Complete', description: 'Migration execution finished. Validation required.', type: 'completed', nextLabel: 'Run Validation', nextRoute: '/migrations' },
  'validation-running': { title: 'Validation Running', description: 'Post-migration validation is verifying data integrity.', type: 'processing', nextLabel: 'View Validation', nextRoute: '/migrations' },
  'validation-passed': { title: 'Validation Passed', description: 'All validation checks passed. Ready for audit.', type: 'completed', nextLabel: 'Start Audit', nextRoute: '/audit' },
  'audit-running': { title: 'Audit Running', description: 'Governance audit is reviewing compliance and evidence.', type: 'processing', nextLabel: 'View Audit', nextRoute: '/audit' },
  'audit-passed': { title: 'Audit Passed', description: 'Governance audit complete. Ready for production.', type: 'completed', nextLabel: 'Production Readiness', nextRoute: '/audit' },
  'go-live': { title: 'Go Live', description: 'Production is active. Entering hyper-care period.', type: 'completed', nextLabel: 'View Client Dashboard', nextRoute: '' },
  'hyper-care': { title: 'Hyper Care', description: 'Intensive post-go-live support and monitoring (2-4 weeks).', type: 'ongoing', nextLabel: 'View Client Dashboard', nextRoute: '' },
  'managed-services': { title: 'Managed Services', description: 'Ongoing AskABD managed engineering services active.', type: 'ongoing', nextLabel: 'View Client Dashboard', nextRoute: '' },
  'continuous-monitoring': { title: 'Continuous Monitoring', description: '24/7 operational monitoring and alerting active.', type: 'ongoing', nextLabel: 'View Client Dashboard', nextRoute: '' },
  'engineering-intelligence': { title: 'Engineering Intelligence', description: 'Continuous engineering intelligence, RCA, and optimization.', type: 'ongoing', nextLabel: 'Open Engineering', nextRoute: '/engineering' },
};

export function OperationStatusPanel({ clientId, status }: Props) {
  const config = stageConfig[status];
  const [opData, setOpData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOperationData();
  }, [clientId, status]);

  async function loadOperationData() {
    setLoading(true);
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
    try {
      if (config?.apiPath) {
        const res = await fetch(`${API}${config.apiPath}${clientId}`, { signal: AbortSignal.timeout(10000) });
        if (res.ok) { const data = await res.json(); setOpData(data); }
      }
    } catch { /* API unavailable */ }
    setLoading(false);
  }

  if (!config) return null;

  const statusColors: Record<string, string> = {
    processing: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    ongoing: 'bg-purple-100 text-purple-700',
  };
  const statusLabels: Record<string, string> = {
    processing: 'IN PROGRESS',
    completed: 'COMPLETED',
    ongoing: 'ACTIVE',
  };

  // Extract operation details from API data
  const discoveryRun = opData?.runs?.[0];
  const assessment = opData?.assessments?.[0];
  const migration = opData?.runs?.[0];

  return (
    <div className="bg-white rounded-xl border p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-bold text-gray-900">{config.title}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">{config.description}</p>
        </div>
        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${statusColors[config.type]}`}>
          {statusLabels[config.type]}
        </span>
      </div>

      {/* Operation Details */}
      {loading ? (
        <p className="text-[10px] text-gray-400">Loading operation status...</p>
      ) : (
        <div className="space-y-2">
          {/* Discovery data */}
          {discoveryRun && (status === 'discovery-running' || status === 'discovery-complete') && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
              <Row label="Status" value={discoveryRun.status} />
              <Row label="Resources Found" value={discoveryRun.resources_found || discoveryRun.resourcesFound} />
              {discoveryRun.connectors_used?.length > 0 && <Row label="Connectors" value={discoveryRun.connectors_used.join(', ')} />}
              {discoveryRun.duration_ms && <Row label="Duration" value={`${discoveryRun.duration_ms}ms`} />}
              {discoveryRun.errors > 0 && <Row label="Errors" value={discoveryRun.errors} highlight />}
              {discoveryRun.started_at && <Row label="Started" value={new Date(discoveryRun.started_at).toLocaleString()} />}
            </div>
          )}

          {/* Assessment data */}
          {assessment && (status === 'assessment-running' || status === 'assessment-complete') && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
              <Row label="Status" value={assessment.status} />
              {assessment.risk_score !== undefined && <Row label="Risk Score" value={`${assessment.risk_score}/100`} />}
              {assessment.complexity_score !== undefined && <Row label="Complexity" value={`${assessment.complexity_score}/100`} />}
              {assessment.findings && <Row label="Findings" value={Array.isArray(assessment.findings) ? assessment.findings.length : 0} />}
            </div>
          )}

          {/* Migration data */}
          {migration && (status === 'migration-running' || status === 'migration-complete') && migration.status && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
              <Row label="Status" value={migration.status} />
              {migration.progress && <Row label="Progress" value={`${migration.progress.mandatoryCompleted || migration.progress.completed || 0}/${migration.progress.mandatory || migration.progress.total || 0} steps`} />}
              {migration.duration_ms && <Row label="Duration" value={`${migration.duration_ms}ms`} />}
              {migration.progress?.mandatoryFailed > 0 && <Row label="Failed" value={migration.progress.mandatoryFailed} highlight />}
            </div>
          )}

          {/* Ongoing service links */}
          {config.type === 'ongoing' && (
            <div className="space-y-1.5">
              {status === 'engineering-intelligence' && (
                <div className="bg-purple-50 rounded-lg p-3">
                  <p className="text-[10px] text-purple-700 font-medium mb-2">Ongoing AskABD Services:</p>
                  <div className="flex flex-wrap gap-1.5">
                    <ServiceLink href={`/clients/${clientId}/engineering`} label="Engineering" />
                    <ServiceLink href={`/clients/${clientId}/monitoring`} label="Monitoring" />
                    <ServiceLink href={`/clients/${clientId}/incidents`} label="Incidents" />
                    <ServiceLink href={`/clients/${clientId}/reports`} label="Reports" />
                    <ServiceLink href={`/clients/${clientId}/audit`} label="Audit" />
                  </div>
                </div>
              )}
              {(status === 'managed-services' || status === 'continuous-monitoring' || status === 'hyper-care') && (
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-[10px] text-green-700 font-medium mb-2">Operational Services:</p>
                  <div className="flex flex-wrap gap-1.5">
                    <ServiceLink href={`/clients/${clientId}/monitoring`} label="Monitoring" />
                    <ServiceLink href={`/clients/${clientId}/incidents`} label="Incidents" />
                    <ServiceLink href={`/clients/${clientId}/services`} label="Services" />
                    <ServiceLink href={`/clients/${clientId}/reports`} label="Reports" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No data available */}
          {!discoveryRun && !assessment && !migration && config.type !== 'ongoing' && (
            <p className="text-[10px] text-gray-400 italic">No operation data available yet.</p>
          )}
        </div>
      )}

      {/* Next Action */}
      <div className="mt-4 pt-3 border-t flex items-center justify-between">
        <div>
          <p className="text-[9px] text-gray-500 uppercase font-medium">Next Step</p>
          <p className="text-xs text-gray-700 font-medium mt-0.5">{config.nextLabel}</p>
        </div>
        <Link href={`/clients/${clientId}${config.nextRoute}`} className="text-[10px] font-semibold bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded transition">
          {config.nextLabel} →
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${highlight ? 'text-red-600' : 'text-gray-800'}`}>{String(value ?? 'N/A')}</span>
    </div>
  );
}

function ServiceLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="text-[9px] font-medium text-purple-600 bg-white border border-purple-200 px-2 py-1 rounded hover:bg-purple-50 transition">{label}</Link>;
}
