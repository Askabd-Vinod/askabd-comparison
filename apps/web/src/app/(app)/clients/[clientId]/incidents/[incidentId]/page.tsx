import Link from 'next/link';
import { notFound } from 'next/navigation';
import { mockClients } from '../../../../../lib/mock-clients';
import { Breadcrumb } from '../../../../../components/breadcrumb';
import { Timeline, TimelineEvent } from '../../../../../components/timeline';
import { AIInsightsPanel } from '../../../../../components/ai-insights';
import { SolutionRecommendation, Solution } from '../../../../../components/solution-recommendation';
import { RemediationPanel, RemediationPlan } from '../../../../../components/remediation-panel';
import { apiSafe } from '../../../../../lib/api';

interface Props { params: Promise<{ clientId: string; incidentId: string }> }

export default async function IncidentDetailPage({ params }: Props) {
  const { clientId, incidentId } = await params;
  const demoClient = mockClients.find(c => c.id === clientId);
  if (demoClient) return <DemoIncidentDetail clientId={clientId} incidentId={incidentId} client={demoClient} />;
  return <RealIncidentDetail clientId={clientId} incidentId={incidentId} />;
}

/**
 * Real incident detail — did not exist before the final master completion pass (every
 * real client fell through to a generic CapabilityPlaceholder here). Fetches the
 * genuine oc_incidents row, finds-or-creates a genuine oc_remediations row for it, and
 * renders the same RemediationPanel used for demo data — now wired to real API calls
 * end-to-end. No fabricated root-cause text, no fabricated "similar pattern in other
 * clients" AI insight — only fields the real record actually has.
 */
async function RealIncidentDetail({ clientId, incidentId }: { clientId: string; incidentId: string }) {
  // REAL BUG FOUND AND FIXED (2026-08-29, RISK-014 triage continuation): all
  // 3 calls below were raw, unauthenticated fetch() against real,
  // Admin.Access-gated routes — the same bug class lib/api.ts's own doc
  // comment documents fixing across "57 Server Components", but this file
  // was missed. In production (real JWT verification), the incident fetch
  // would 401, `incident` would stay null, and this page would show a
  // genuinely real, existing incident as `notFound()` — actively misleading,
  // not just degraded. Fixed by switching to apiSafe(), which carries the
  // real staff-session cookie forward.
  const incidentData = await apiSafe<{ incident?: any }>(`/api/v1/oc/incidents/${incidentId}`, {});
  const incident = incidentData.incident ?? null;
  if (!incident || incident.client_id !== clientId) notFound();

  let clientName = clientId;
  {
    const clientData = await apiSafe<{ client?: { name?: string } }>(`/api/v1/oc/clients/${clientId}`, {});
    if (clientData.client?.name) clientName = clientData.client.name;
  }

  // Real, atomic find-or-create — one request, no race between "check" and "create"
  // (a real duplicate-remediation bug was found and fixed here during live browser
  // verification of this exact page — see findOrCreateRemediation in
  // operations-center-service.ts for the full explanation).
  const remediationData = await apiSafe<{ remediation?: any }>('/api/v1/oc/remediations/find-or-create', {}, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      incidentId: incident.id, clientId, title: `Remediate: ${incident.title}`,
      description: incident.description || '', grade: incident.severity === 'critical' ? 'expedited' : 'standard',
      fixImmediate: 'To be determined by the assigned engineer', fixPermanent: incident.root_cause || 'Pending root cause analysis',
      impactAnalysis: { affectedServices: incident.affected_service ? [incident.affected_service] : [], affectedEnvironments: [incident.environment || 'production'], riskLevel: incident.severity, downtime: 'Not yet estimated', clientImpact: 'Not yet assessed', dataRisk: 'Not yet assessed', rollbackTime: 'Not yet estimated', dependencies: [], sideEffects: [] },
      steps: [
        { id: 'step-1', label: 'Confirm root cause', description: 'Verify the actual cause before applying a fix', status: 'pending' },
        { id: 'step-2', label: 'Apply fix', description: 'Apply the agreed remediation', status: 'pending' },
        { id: 'step-3', label: 'Verify resolution', description: 'Confirm the incident is genuinely resolved', status: 'pending' },
      ],
      validationCriteria: ['Incident no longer reproducible', 'No new related alerts'],
      rollbackPlan: 'Revert the applied change if verification fails',
      owner: incident.assigned_to || 'unassigned',
    }),
  });
  const remediation = remediationData.remediation ?? null;

  const timeline: TimelineEvent[] = [
    { timestamp: incident.detected_at, title: 'Incident detected', type: 'incident', description: incident.title },
    ...(incident.acknowledged_at ? [{ timestamp: incident.acknowledged_at, title: `Acknowledged${incident.acknowledged_by ? ` by ${incident.acknowledged_by}` : ''}`, type: 'info' as const }] : []),
    ...(incident.mitigated_at ? [{ timestamp: incident.mitigated_at, title: 'Mitigated', type: 'change' as const }] : []),
    ...(incident.resolved_at ? [{ timestamp: incident.resolved_at, title: `Resolved${incident.resolved_by ? ` by ${incident.resolved_by}` : ''}`, type: 'change' as const }] : []),
    ...(incident.verified_at ? [{ timestamp: incident.verified_at, title: 'Verified', type: 'info' as const }] : []),
    ...(incident.closed_at ? [{ timestamp: incident.closed_at, title: 'Closed', type: 'change' as const }] : []),
  ];

  const remediationPlan: RemediationPlan | null = remediation ? {
    id: remediation.id, title: remediation.title, description: remediation.description,
    grade: remediation.grade, incident: { id: incident.id, title: incident.title, severity: incident.severity },
    client: { id: clientId, name: clientName },
    fix: { immediate: remediation.fix_immediate, permanent: remediation.fix_permanent },
    impact: remediation.impact_analysis, steps: remediation.steps || [],
    rollbackPlan: remediation.rollback_plan, validationCriteria: remediation.validation_criteria || [],
    owner: remediation.owner, approvedBy: remediation.approved_by, phase: remediation.phase,
    startedAt: remediation.started_at, completedAt: remediation.completed_at, ticketClosed: remediation.ticket_closed,
  } : null;

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' }, { label: 'Clients', href: '/clients' },
        { label: clientName, href: `/clients/${clientId}` }, { label: 'Incidents', href: `/clients/${clientId}/incidents` },
        { label: incident.title },
      ]} />

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{incident.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${incident.severity === 'critical' ? 'bg-red-100 text-red-700' : incident.severity === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>{incident.severity}</span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${['detected', 'acknowledged', 'investigating', 'mitigating'].includes(incident.status) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{incident.status}</span>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Incident Detail</h2>
            <div className="grid md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <Row label="Severity" value={incident.severity} />
                <Row label="Status" value={incident.status} />
                <Row label="Detected" value={fmtDate(incident.detected_at)} />
                <Row label="Duration" value={incident.duration_minutes ? `${incident.duration_minutes} min` : 'Ongoing'} />
              </div>
              <div className="space-y-2">
                <Row label="Root Cause" value={incident.root_cause || 'Not yet determined'} />
                <Row label="Confidence" value={incident.root_cause_confidence || 'Not available'} />
                <Row label="Affected Service" value={incident.affected_service || 'Not recorded'} />
                <Row label="Environment" value={incident.environment} />
              </div>
            </div>
            {incident.description && (
              <p className="text-xs text-gray-600 mt-3 pt-3 border-t">{incident.description}</p>
            )}
          </section>

          <Timeline events={timeline} title="Incident Timeline — real recorded transitions" />

          {remediationPlan ? (
            <RemediationPanel plan={remediationPlan} />
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-xs text-amber-700">
              Remediation record not available — the API may be unreachable. Refresh to retry.
            </div>
          )}
        </div>

        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Related</h3>
            <div className="space-y-1.5">
              <QuickLink href={`/clients/${clientId}/incidents`} label="All Incidents" />
              <QuickLink href={`/clients/${clientId}/audit`} label="Audit Trail" />
              <QuickLink href={`/clients/${clientId}/monitoring`} label="Monitoring Data" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Original demo-data rendering — unchanged, now covered by DemoDataBanner in the shared layout. */
function DemoIncidentDetail({ clientId, incidentId, client }: { clientId: string; incidentId: string; client: NonNullable<ReturnType<typeof mockClients.find>> }) {
  const inc = client.incidents.find(i => i.id === incidentId);
  if (!inc) notFound();

  const timeline: TimelineEvent[] = [
    { timestamp: inc.createdAt, title: 'Incident opened', type: 'incident', description: inc.title },
    { timestamp: new Date(new Date(inc.createdAt).getTime() + 300000).toISOString(), title: 'Alert triggered', type: 'alert', description: 'Automated detection', href: `/clients/${clientId}/alerts` },
    { timestamp: new Date(new Date(inc.createdAt).getTime() + 600000).toISOString(), title: `Assigned to ${inc.assignedEngineer}`, type: 'info' },
    { timestamp: new Date(new Date(inc.createdAt).getTime() + 900000).toISOString(), title: 'Investigation started', type: 'info', description: 'Root cause analysis in progress' },
    ...(inc.resolvedAt ? [{ timestamp: inc.resolvedAt, title: 'Incident resolved', type: 'change' as const, description: inc.resolution }] : []),
  ];

  const solution: Solution = {
    immediateFix: inc.resolution || 'Restart affected service and increase connection pool',
    permanentFix: inc.rootCause ? `Address root cause: ${inc.rootCause}` : 'Apply permanent fix after RCA completion',
    priority: inc.severity === 'critical' ? 'critical' : inc.severity === 'major' ? 'high' : 'medium',
    effort: inc.severity === 'critical' ? '2-4 hours' : '1-2 days',
    businessImpact: `Service degradation affecting ${client.name} operations`,
    technicalImpact: 'Reduced throughput and increased error rate',
    dependencies: ['Database team', 'Platform engineering'],
    validationSteps: ['Verify error rate returns to baseline', 'Confirm no data loss', 'Run regression tests'],
    rollbackPlan: 'Revert to previous stable version if fix causes regression',
    owner: inc.assignedEngineer,
    status: inc.status === 'resolved' || inc.status === 'closed' ? 'completed' : 'in-progress',
  };

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Clients', href: '/clients' },
        { label: client.name, href: `/clients/${clientId}` },
        { label: 'Incidents', href: `/clients/${clientId}/incidents` },
        { label: inc.title },
      ]} />

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{inc.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${inc.severity === 'critical' ? 'bg-red-100 text-red-700' : inc.severity === 'major' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>{inc.severity}</span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${inc.status === 'open' ? 'bg-red-100 text-red-700' : inc.status === 'investigating' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>{inc.status}</span>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Executive Summary</h2>
            <div className="grid md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <Row label="Severity" value={inc.severity} />
                <Row label="Status" value={inc.status} />
                <Row label="Assigned" value={inc.assignedEngineer} />
                <Row label="Created" value={fmtDate(inc.createdAt)} />
                <Row label="Resolved" value={inc.resolvedAt ? fmtDate(inc.resolvedAt) : 'Pending'} />
              </div>
              <div className="space-y-2">
                <Row label="Root Cause" value={inc.rootCause || 'Under investigation'} />
                <Row label="Resolution" value={inc.resolution || 'Pending'} />
                <Row label="Affected Client" value={client.name} />
                <Row label="Environment" value="Production" />
                <Row label="Impact" value={inc.severity === 'critical' ? 'Service outage' : 'Performance degradation'} />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Root Cause Analysis</h2>
            <div className="text-xs space-y-3">
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-1">Five Whys</p>
                <ol className="list-decimal list-inside text-gray-700 space-y-1">
                  <li>Service errors increased → {inc.rootCause || 'Connection failures detected'}</li>
                  <li>Connections failed → Pool exhausted under load</li>
                  <li>Pool exhausted → Connection leak in ORM layer</li>
                  <li>Connection leak → Missing timeout configuration</li>
                  <li>Missing config → Default settings used from initial setup</li>
                </ol>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-1">Corrective Actions</p>
                <ul className="list-disc list-inside text-gray-700 space-y-0.5">
                  <li>Add connection timeout to database configuration</li>
                  <li>Implement connection pool monitoring alert</li>
                  <li>Add automated pool size scaling</li>
                </ul>
              </div>
            </div>
          </section>

          <Timeline events={timeline} title="Incident Timeline" />
          <SolutionRecommendation solution={solution} />

          <RemediationPanel plan={{
            id: `rem-${inc.id}`,
            title: `Remediate: ${inc.title}`,
            description: `Guided resolution for ${inc.title} affecting ${client.name}`,
            grade: inc.severity === 'critical' ? 'expedited' : 'standard',
            incident: { id: inc.id, title: inc.title, severity: inc.severity },
            client: { id: client.id, name: client.name },
            fix: {
              immediate: inc.resolution || 'Restart affected service and increase connection pool size',
              permanent: inc.rootCause ? `Address root cause: ${inc.rootCause}` : 'Apply permanent fix after root cause analysis',
            },
            impact: {
              affectedServices: ['Database', 'API Gateway', 'Backend Workers'],
              affectedEnvironments: ['Production'],
              downtime: inc.severity === 'critical' ? '2-5 minutes during fix' : 'Zero downtime (rolling)',
              riskLevel: inc.severity === 'critical' ? 'high' : inc.severity === 'major' ? 'medium' : 'low',
              clientImpact: inc.severity === 'critical' ? 'Brief service interruption during fix application' : 'No client-facing impact expected',
              dataRisk: 'None — read-only operations during fix. No schema changes.',
              rollbackTime: '< 2 minutes (automated)',
              dependencies: ['Database team availability', 'CI/CD pipeline healthy'],
              sideEffects: [
                'Active database connections will be recycled',
                'In-flight requests may timeout during pool restart',
                inc.severity === 'critical' ? 'Monitoring alerts may trigger during transition' : '',
              ].filter(Boolean),
            },
            steps: [
              { id: 'step-1', label: 'Pre-flight checks', description: 'Verify environment health and backup status', status: 'pending' },
              { id: 'step-2', label: 'Create snapshot', description: 'Take configuration and state snapshot for rollback', status: 'pending' },
              { id: 'step-3', label: 'Apply fix', description: solution.immediateFix, status: 'pending' },
              { id: 'step-4', label: 'Health verification', description: 'Confirm services respond correctly after fix', status: 'pending' },
              { id: 'step-5', label: 'Regression test', description: 'Run automated test suite against affected endpoints', status: 'pending' },
              { id: 'step-6', label: 'Metrics validation', description: 'Confirm error rate and latency return to baseline', status: 'pending' },
            ],
            rollbackPlan: 'Restore from snapshot created in step 2. All changes reverted within 2 minutes.',
            validationCriteria: [
              'Error rate < 0.1% for 5 minutes',
              'API latency p99 < 500ms',
              'All health checks passing',
              'No new alerts triggered',
            ],
            owner: inc.assignedEngineer,
            phase: inc.status === 'resolved' || inc.status === 'closed' ? 'completed' : 'idle',
          }} />
        </div>

        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Related Entities</h3>
            <div className="space-y-1.5">
              <QuickLink href={`/clients/${clientId}/deployments`} label="Related Deployments" />
              <QuickLink href={`/clients/${clientId}/alerts`} label="Related Alerts" />
              <QuickLink href={`/clients/${clientId}/audit`} label="Audit Trail" />
              <QuickLink href={`/clients/${clientId}/monitoring`} label="Monitoring Data" />
              <QuickLink href={`/clients/${clientId}/infrastructure`} label="Affected Infrastructure" />
              <QuickLink href={`/clients/${clientId}/support`} label="Support Tickets" />
            </div>
          </section>

          <AIInsightsPanel insights={[
            { type: 'root-cause' as 'issue', severity: inc.severity === 'critical' ? 'critical' : 'high', title: 'Root cause identified', description: inc.rootCause || 'Investigation ongoing — automated analysis suggests connection pool issue.' },
            { type: 'prediction', severity: 'medium', title: 'Recurrence risk', description: 'Similar pattern detected in 2 other clients. Recommend platform-wide fix.', action: 'View Pattern', href: '/incidents' },
            { type: 'recommendation', severity: 'low', title: 'Prevention measure', description: 'Add automated connection pool monitoring to prevent future occurrences.', action: 'View Monitoring', href: `/clients/${clientId}/monitoring` },
          ]} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-medium text-gray-800">{value}</span></div>; }
function QuickLink({ href, label }: { href: string; label: string }) { return <Link href={href} className="block text-xs text-gray-600 hover:text-purple-600 py-1.5 px-2 rounded hover:bg-purple-50 transition">{label}</Link>; }
function fmtDate(iso: string): string { try { return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } }
