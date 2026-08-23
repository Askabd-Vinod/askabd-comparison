'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Breadcrumb } from '../../../../../components/breadcrumb';
import { Timeline, type TimelineEvent } from '../../../../../components/timeline';
import { EvidenceBadge, type EvidenceStatus } from '../../../../../components/evidence-status';
import { Action } from '../../../../../components/button';
import { ErrorState } from '../../../../../components/error-state';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

/**
 * Real Deployment detail — replaces the fully fabricated version of this
 * page (hardcoded release notes, an always-all-✓ checklist, a hardcoded
 * "Reviewer/Approver: hello@askabd.com", fabricated post-deploy metrics,
 * a fabricated "95% confidence" AI insight). See
 * docs/eoc-feature-coverage-matrix.md row #52's correction. Every section
 * below is server-authoritative; any value with no real source shows
 * "Not available from current evidence" rather than a fabricated number.
 */

interface ReadinessDimension { name: string; status: string; detail: string; blocking: boolean }
interface Deployment {
  id: string; clientId: string; environment: string; application: string; version: string; previousVersion: string | null;
  source: string; target: string; deploymentType: string; plannedStart: string | null; actualStart: string | null;
  actualCompletion: string | null; requestedBy: string | null; status: string; risk: string;
  releaseReadinessSnapshot: { overall: string; dimensions: ReadinessDimension[] } | null; releaseReadinessCheckedAt: string | null;
  approvalWorkflowId: string | null; notes: string; rollbackPlan: string; rollbackStatus: string;
  postDeploymentSuiteId: string | null; comparisonRunId: string | null;
  events: { event: string; fromStatus: string | null; toStatus: string; actor: string | null; timestamp: string; reason?: string }[];
  createdBy: string | null; createdAt: string; updatedAt: string;
}
interface ApprovalWorkflow { id: string; status: string; submittedBy: string | null; submittedAt: string | null; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null }
interface PostDeploymentCheck { testCaseId: string; title: string; latestExecution: { status: string; actualResult: string; executedBy: string | null; executedAt: string } | null }

const STATUS_MAP: Record<string, { status: EvidenceStatus; label: string }> = {
  draft: { status: 'not_configured', label: 'Draft' }, planned: { status: 'checking', label: 'Planned' },
  readiness_pending: { status: 'checking', label: 'Checking Readiness' }, approval_pending: { status: 'action_required', label: 'Awaiting Approval' },
  approved: { status: 'checking', label: 'Approved — Ready to Execute' }, in_progress: { status: 'checking', label: 'In Progress' },
  deployed: { status: 'checking', label: 'Deployed — Awaiting Validation' }, validation_pending: { status: 'checking', label: 'Validation Pending' },
  validated: { status: 'verified', label: 'Validated' }, failed: { status: 'failed', label: 'Failed' },
  rollback_pending: { status: 'action_required', label: 'Rollback Pending' }, rolled_back: { status: 'not_configured', label: 'Rolled Back' },
  cancelled: { status: 'not_configured', label: 'Cancelled' },
};

export default function DeploymentDetailPage() {
  const params = useParams<{ clientId: string; deploymentId: string }>();
  const { clientId, deploymentId } = params;
  const [dep, setDep] = useState<Deployment | null>(null);
  const [approval, setApproval] = useState<{ current: ApprovalWorkflow | null } | null>(null);
  const [checks, setChecks] = useState<PostDeploymentCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/deployments/${deploymentId}`);
      if (!res.ok) { setError(res.status === 404 ? 'This deployment was not found for this client.' : 'Unable to load this deployment.'); setLoading(false); return; }
      const data: Deployment = await res.json();
      setDep(data);
      const approvalRes = await fetch(`${API}/api/v1/oc/clients/${clientId}/deployments/${deploymentId}/approval`);
      if (approvalRes.ok) setApproval(await approvalRes.json());
      if (data.postDeploymentSuiteId) {
        const statusRes = await fetch(`${API}/api/v1/oc/clients/${clientId}/deployments/${deploymentId}/post-deployment/status`);
        if (statusRes.ok) setChecks((await statusRes.json()).checks || []);
      }
    } catch (err) {
      setError(`Unable to reach the AskABD API: ${(err as Error).message}`);
    }
    setLoading(false);
  }, [clientId, deploymentId]);

  useEffect(() => { load(); }, [load]);

  async function doAction(path: string, body?: Record<string, unknown>) {
    setBusy(true); setActionError('');
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/deployments/${deploymentId}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error?.message || 'That action could not be completed.');
        return;
      }
      await load();
    } finally { setBusy(false); }
  }

  if (loading) return <div className="p-6 text-gray-400">Loading deployment...</div>;
  if (error || !dep) return (
    <div className="p-6"><ErrorState what="Deployment could not be loaded" why={error || 'No data returned.'} actions={['Confirm the API is reachable', 'Retry']} onRetry={load} /></div>
  );

  const meta = STATUS_MAP[dep.status] || { status: 'not_configured' as EvidenceStatus, label: dep.status };
  const timeline: TimelineEvent[] = dep.events.map(e => ({
    timestamp: e.timestamp, title: `${e.fromStatus ? `${e.fromStatus} → ` : ''}${e.toStatus}`,
    description: e.reason || (e.actor ? `by ${e.actor}` : 'system'), type: 'deployment',
  }));

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' }, { label: 'Clients', href: '/clients' },
        { label: dep.clientId, href: `/clients/${clientId}` },
        { label: 'Deployments', href: `/clients/${clientId}/deployments` },
        { label: `${dep.application} v${dep.version}` },
      ]} />

      <div className="flex items-center justify-between mb-6 mt-3">
        <div>
          <h1 className="text-xl font-bold">{dep.application} v{dep.version}</h1>
          <p className="text-sm text-gray-500 capitalize">{dep.environment} • {dep.deploymentType.replace(/_/g, ' ')}</p>
        </div>
        <EvidenceBadge status={meta.status} label={meta.label} />
      </div>

      {actionError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700">{actionError}</div>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold text-sm mb-3">Deployment Overview</h2>
            <div className="grid md:grid-cols-2 gap-2 text-xs">
              <Row label="Previous Version" value={dep.previousVersion || 'Not available from current evidence'} />
              <Row label="Source" value={dep.source || 'Not available from current evidence'} />
              <Row label="Target" value={dep.target || 'Not available from current evidence'} />
              <Row label="Risk" value={dep.risk} capitalize />
              <Row label="Requested By" value={dep.requestedBy || 'Not available from current evidence'} />
              <Row label="Planned Start" value={fmt(dep.plannedStart)} />
              <Row label="Actual Start" value={fmt(dep.actualStart)} />
              <Row label="Actual Completion" value={fmt(dep.actualCompletion)} />
            </div>
            {dep.notes && <p className="text-xs text-gray-600 mt-3 border-t pt-3">{dep.notes}</p>}
          </section>

          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold text-sm mb-3">Release Readiness</h2>
            {!dep.releaseReadinessSnapshot ? (
              <p className="text-xs text-gray-500">Not checked yet for this deployment.</p>
            ) : (
              <div>
                <p className={`text-xs font-medium mb-2 ${dep.releaseReadinessSnapshot.overall === 'go' ? 'text-green-700' : 'text-red-700'}`}>Overall: {dep.releaseReadinessSnapshot.overall.toUpperCase()} — checked {fmt(dep.releaseReadinessCheckedAt)}</p>
                <div className="space-y-1.5">
                  {dep.releaseReadinessSnapshot.dimensions.map(d => (
                    <div key={d.name} className="flex items-start gap-2 text-xs">
                      <span className={d.status === 'pass' ? 'text-green-600' : d.status === 'fail' ? 'text-red-600' : 'text-gray-400'}>{d.status === 'pass' ? '✓' : d.status === 'fail' ? '✗' : '—'}</span>
                      <span className="text-gray-700">{d.name}: <span className="text-gray-500">{d.detail}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold text-sm mb-3">Approval</h2>
            {!approval?.current ? (
              <p className="text-xs text-gray-500">No approval has been requested yet.</p>
            ) : (
              <div className="text-xs space-y-1">
                <Row label="Status" value={approval.current.status} capitalize />
                <Row label="Submitted By" value={approval.current.submittedBy || 'Not available from current evidence'} />
                <Row label="Submitted At" value={fmt(approval.current.submittedAt)} />
                <Row label="Decided By" value={approval.current.decidedBy || 'Not decided yet'} />
                <Row label="Decision Note" value={approval.current.decisionNote || 'Not available from current evidence'} />
              </div>
            )}
          </section>

          {dep.postDeploymentSuiteId && (
            <section className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold text-sm mb-3">Post-Deployment Validation</h2>
              {checks.length === 0 ? <p className="text-xs text-gray-500">No checks recorded.</p> : (
                <div className="space-y-1.5">
                  {checks.map(c => (
                    <div key={c.testCaseId} className="flex items-center justify-between text-xs border-b pb-1.5 last:border-0">
                      <span className="text-gray-700">{c.title}</span>
                      {c.latestExecution ? <span className={c.latestExecution.status === 'pass' ? 'text-green-600 font-medium' : c.latestExecution.status === 'fail' ? 'text-red-600 font-medium' : 'text-gray-400'}>{c.latestExecution.status}</span> : <span className="text-gray-400">not executed</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold text-sm mb-3">Rollback</h2>
            <Row label="Plan" value={dep.rollbackPlan || 'No rollback plan recorded — rollback is not available for this deployment.'} />
            <Row label="Status" value={dep.rollbackStatus.replace(/_/g, ' ')} capitalize />
          </section>

          {timeline.length > 0 && <Timeline events={timeline} title="Audit Trail" />}
        </div>

        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Actions</h3>
            <div className="space-y-2">
              {dep.status === 'draft' && <Action variant="primary" className="w-full justify-center" loading={busy} onClick={() => doAction('/plan')}>Plan Deployment</Action>}
              {dep.status === 'planned' && <Action variant="primary" className="w-full justify-center" loading={busy} onClick={() => doAction('/check-readiness')}>Check Release Readiness</Action>}
              {dep.status === 'readiness_pending' && <Action variant="primary" className="w-full justify-center" loading={busy} onClick={() => doAction('/request-approval')}>Request Approval</Action>}
              {dep.status === 'approval_pending' && (
                <>
                  <Action variant="primary" className="w-full justify-center" loading={busy} onClick={() => doAction('/approval/approve')}>Approve</Action>
                  <Action variant="secondary" className="w-full justify-center" loading={busy} onClick={() => doAction('/approval/reject', { note: 'Rejected via console.' })}>Reject</Action>
                </>
              )}
              {dep.status === 'approved' && <Action variant="primary" className="w-full justify-center" loading={busy} onClick={() => doAction('/start-execution')}>Start Execution</Action>}
              {dep.status === 'in_progress' && (
                <>
                  <Action variant="primary" className="w-full justify-center" loading={busy} onClick={() => doAction('/outcome', { outcome: 'deployed', evidence: 'Reported deployed via console.' })}>Record: Deployed</Action>
                  <Action variant="secondary" className="w-full justify-center" loading={busy} onClick={() => doAction('/outcome', { outcome: 'failed', evidence: 'Reported failed via console.' })}>Record: Failed</Action>
                </>
              )}
              {dep.status === 'failed' && dep.rollbackPlan && <Action variant="secondary" className="w-full justify-center" loading={busy} onClick={() => doAction('/rollback/initiate')}>Initiate Rollback</Action>}
              {['draft', 'planned', 'readiness_pending', 'approval_pending', 'approved'].includes(dep.status) && (
                <Action variant="secondary" className="w-full justify-center" loading={busy} onClick={() => doAction('/cancel', { reason: 'Cancelled via console.' })}>Cancel</Action>
              )}
              {!['draft', 'planned', 'readiness_pending', 'approval_pending', 'approved', 'in_progress', 'failed'].includes(dep.status) && (
                <p className="text-[11px] text-gray-400 text-center">No further real actions available from status &quot;{dep.status}&quot;.</p>
              )}
            </div>
          </section>

          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Quick Links</h3>
            <div className="space-y-1.5">
              <QuickLink href={`/clients/${clientId}/environments`} label={`${dep.environment} Environment`} />
              <QuickLink href={`/clients/${clientId}/release-readiness`} label="Release Readiness" />
              <QuickLink href={`/clients/${clientId}/audit`} label="Audit Trail" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return <div className="flex justify-between gap-3"><span className="text-gray-500 shrink-0">{label}</span><span className={`font-medium text-gray-800 text-right ${capitalize ? 'capitalize' : ''}`}>{value}</span></div>;
}
function QuickLink({ href, label }: { href: string; label: string }) { return <Link href={href} className="block text-xs text-gray-600 hover:text-purple-600 py-1.5 px-2 rounded hover:bg-purple-50 transition">{label}</Link>; }
function fmt(iso: string | null): string { return iso ? new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Not available from current evidence'; }
