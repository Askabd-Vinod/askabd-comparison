'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { executeRemediation, startRemediationStep, completeRemediationStep, failRemediationStep, closeRemediationTicket, getRemediation, logAuditEvent } from '../lib/operations-api';
import { sendNotification, getStandardSubject } from '../lib/notifications';
import { getStaffSession } from '../lib/staff-session';

export type RemediationGrade = 'standard' | 'expedited';

export type RemediationPhase =
  | 'idle'
  | 'impact-analysis'
  | 'approval-pending'
  | 'executing'
  | 'validating'
  | 'completed'
  | 'rolled-back'
  | 'failed';

export interface RemediationStep {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'in-progress' | 'passed' | 'failed' | 'skipped';
  duration?: string;
  note?: string;
  actor?: string;
}

export interface ImpactAnalysis {
  affectedServices: string[];
  affectedEnvironments: string[];
  downtime: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  clientImpact: string;
  dataRisk: string;
  rollbackTime: string;
  dependencies: string[];
  sideEffects: string[];
}

export interface RemediationPlan {
  /** Real oc_remediations.id — this component is inert without a real, DB-backed record. */
  id: string;
  title: string;
  description: string;
  grade: RemediationGrade;
  incident: { id: string; title: string; severity: string };
  client: { id: string; name: string };
  fix: { immediate: string; permanent: string };
  impact: ImpactAnalysis;
  steps: RemediationStep[];
  rollbackPlan: string;
  validationCriteria: string[];
  owner: string;
  approvedBy?: string;
  phase: RemediationPhase;
  startedAt?: string;
  completedAt?: string;
  ticketClosed?: boolean;
}

interface RemediationPanelProps {
  plan: RemediationPlan;
}

/**
 * Real remediation execution — found during the final master completion pass:
 * this panel previously simulated its entire step-by-step execution client-side
 * (setInterval, fabricated durations, fabricated evidence entries, a hardcoded
 * approver, and localStorage as the only persistence). Every action here now calls
 * a real API route backed by oc_remediations + the shared oc_operations model —
 * step timing is genuinely measured server-side, evidence is whatever the operator
 * actually typed, and state survives refresh/new-browser/different-staff-member
 * because it lives in Postgres, not this component.
 */
export function RemediationPanel({ plan: initialPlan }: RemediationPanelProps) {
  const [plan, setPlan] = useState<RemediationPlan>(initialPlan);
  const [selectedGrade, setSelectedGrade] = useState<RemediationGrade>(initialPlan.grade);
  const [showImpact, setShowImpact] = useState(initialPlan.phase !== 'idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [userVerdict, setUserVerdict] = useState<'resolved' | 'not-resolved' | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const actor = getStaffSession()?.identityId || 'staff';

  const refresh = useCallback(async () => {
    try {
      const res = await getRemediation(initialPlan.id);
      if (res.remediation) {
        setPlan(prev => ({
          ...prev,
          phase: res.remediation.phase,
          steps: res.remediation.steps || prev.steps,
          startedAt: res.remediation.started_at,
          completedAt: res.remediation.completed_at,
          approvedBy: res.remediation.approved_by,
          ticketClosed: res.remediation.ticket_closed,
        }));
      }
    } catch {
      // Real record not reachable right now — keep last known state, don't fabricate a change.
    }
  }, [initialPlan.id]);

  // Real state on mount — never trust only what the parent page passed in, since
  // another staff member may have already acted on this same remediation.
  useEffect(() => { refresh(); }, [refresh]);

  // Light polling only while something is genuinely in flight server-side, so a
  // second staff member watching the same incident sees real progress without a
  // manual refresh — same pattern OperationProgress already uses elsewhere.
  useEffect(() => {
    if (plan.phase === 'executing' || plan.phase === 'validating') {
      pollRef.current = setInterval(refresh, 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [plan.phase, refresh]);

  const phaseLabels: Record<RemediationPhase, string> = {
    'idle': 'Ready to Remediate',
    'impact-analysis': 'Reviewing Impact',
    'approval-pending': 'Awaiting Approval',
    'executing': 'Executing',
    'validating': 'Awaiting Verification',
    'completed': 'Fix Applied',
    'rolled-back': 'Rolled Back',
    'failed': 'Remediation Failed',
  };
  const phaseColors: Record<RemediationPhase, string> = {
    'idle': 'bg-gray-100 text-gray-600', 'impact-analysis': 'bg-blue-100 text-blue-700',
    'approval-pending': 'bg-yellow-100 text-yellow-700', 'executing': 'bg-purple-100 text-purple-700',
    'validating': 'bg-indigo-100 text-indigo-700', 'completed': 'bg-green-100 text-green-700',
    'rolled-back': 'bg-orange-100 text-orange-700', 'failed': 'bg-red-100 text-red-700',
  };
  const riskColors: Record<string, string> = {
    low: 'text-green-600 bg-green-50 border-green-200', medium: 'text-orange-600 bg-orange-50 border-orange-200',
    high: 'text-red-600 bg-red-50 border-red-200', critical: 'text-red-700 bg-red-100 border-red-300',
  };
  const stepColors: Record<RemediationStep['status'], string> = {
    pending: 'bg-gray-100 text-gray-400', 'in-progress': 'bg-purple-100 text-purple-600 animate-pulse',
    passed: 'bg-green-100 text-green-600', failed: 'bg-red-100 text-red-600', skipped: 'bg-gray-100 text-gray-400',
  };

  async function beginApproval() {
    setShowImpact(true);
    setPlan(p => ({ ...p, phase: 'approval-pending' }));
  }

  async function approveAndExecute() {
    setBusy(true); setError(null);
    try {
      const res = await executeRemediation(plan.id, actor) as any;
      if (res.error) {
        // Already executing (409) — a real, concurrent state, not a failure. Adopt it.
        if (res.operation) await refresh();
        else setError(res.error);
        return;
      }
      setPlan(p => ({ ...p, phase: res.remediation.phase, steps: res.remediation.steps, startedAt: res.remediation.started_at, approvedBy: actor }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start execution — connection failed.');
    } finally { setBusy(false); }
  }

  async function startStep(stepId: string) {
    setBusy(true); setError(null);
    try {
      const res = await startRemediationStep(plan.id, stepId, actor);
      setPlan(p => ({ ...p, steps: res.remediation.steps }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start this step.');
    } finally { setBusy(false); }
  }

  async function completeStep(stepId: string) {
    setBusy(true); setError(null);
    try {
      const res = await completeRemediationStep(plan.id, stepId, actor, noteDrafts[stepId]);
      setPlan(p => ({ ...p, phase: res.remediation.phase, steps: res.remediation.steps, completedAt: res.remediation.completed_at }));
      setNoteDrafts(d => ({ ...d, [stepId]: '' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark this step complete.');
    } finally { setBusy(false); }
  }

  async function failStep(stepId: string) {
    setBusy(true); setError(null);
    try {
      const res = await failRemediationStep(plan.id, stepId, actor, noteDrafts[stepId]);
      setPlan(p => ({ ...p, phase: res.remediation.phase, steps: res.remediation.steps }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark this step failed.');
    } finally { setBusy(false); }
  }

  async function closeTicket() {
    setBusy(true); setError(null);
    try {
      const res = await closeRemediationTicket(plan.id, actor);
      setPlan(p => ({ ...p, ticketClosed: res.remediation.ticket_closed, phase: res.remediation.phase, completedAt: res.remediation.completed_at }));
      logAuditEvent({
        entityType: 'remediation', entityId: plan.id, entityName: plan.title, action: 'resolved', actor,
        details: { incidentId: plan.incident.id, clientId: plan.client.id, ticketClosed: true },
        evidence: [`Ticket closed and verified by ${actor}`],
      }).catch(() => {});
      sendNotification({
        clientId: plan.client.id, clientName: plan.client.name, phase: 'resolution', priority: 'low',
        subject: getStandardSubject('resolution', plan.incident.title, plan.client.name),
        summary: `Incident "${plan.incident.title}" has been resolved and verified. Ticket closed.`,
        details: { action: 'Incident Resolved & Ticket Closed', performedBy: actor, timestamp: new Date().toISOString(), environment: 'Production', impactLevel: 'None — issue resolved', nextSteps: 'Post-fix monitoring active. No further action required.' },
        recipients: [], evidence: [],
      }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not close the ticket.');
    } finally { setBusy(false); }
  }

  const allStepsDone = plan.steps.length > 0 && plan.steps.every(s => s.status === 'passed' || s.status === 'skipped');
  const anyStepFailed = plan.steps.some(s => s.status === 'failed');

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">🔧</span>
          <div>
            <h3 className="font-semibold text-sm text-gray-900">Remediate Issue</h3>
            <p className="text-[10px] text-gray-500">Real, operator-driven resolution — every action here is persisted server-side</p>
          </div>
        </div>
        <span className={`text-[10px] font-medium px-2.5 py-1 rounded-full ${plan.ticketClosed ? 'bg-green-200 text-green-800' : phaseColors[plan.phase]}`}>
          {plan.ticketClosed ? '✓ Fixed — Ticket Closed' : phaseLabels[plan.phase]}
        </span>
      </div>

      <div className="p-5 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {plan.phase === 'idle' && (
          <>
            <div>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Remediation Mode</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setSelectedGrade('standard')} className={`border rounded-lg p-3 text-left transition ${selectedGrade === 'standard' ? 'border-purple-400 bg-purple-50 ring-1 ring-purple-200' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className="text-xs font-semibold text-gray-900">Standard</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Full impact analysis, manual approval, phased rollout. Recommended for production environments.</p>
                </button>
                <button onClick={() => setSelectedGrade('expedited')} className={`border rounded-lg p-3 text-left transition ${selectedGrade === 'expedited' ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-200' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className="text-xs font-semibold text-gray-900">Expedited</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Rapid impact check, faster approval for P1. For critical outages only.</p>
                </button>
              </div>
            </div>
            <div className="border rounded-lg p-3 bg-gray-50">
              <p className="text-[10px] font-medium text-gray-500 uppercase mb-2">Proposed Fix</p>
              <div className="grid md:grid-cols-2 gap-3 text-xs">
                <div><p className="text-[10px] text-gray-400 mb-0.5">Immediate</p><p className="text-gray-700">{plan.fix.immediate}</p></div>
                <div><p className="text-[10px] text-gray-400 mb-0.5">Permanent</p><p className="text-gray-700">{plan.fix.permanent}</p></div>
              </div>
            </div>
            <button onClick={beginApproval} className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2.5 rounded-lg transition shadow-sm">
              Review Impact — {selectedGrade === 'expedited' ? 'Expedited' : 'Standard'} Mode
            </button>
          </>
        )}

        {showImpact && plan.phase !== 'idle' && (
          <div className={`border rounded-lg p-4 ${riskColors[plan.impact.riskLevel]}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold">Impact Analysis</p>
              <span className="text-[10px] font-bold uppercase">Risk: {plan.impact.riskLevel}</span>
            </div>
            <div className="grid md:grid-cols-2 gap-3 text-[11px]">
              <div className="space-y-1.5">
                <div><span className="text-gray-500">Affected Services:</span> <span className="font-medium">{plan.impact.affectedServices.join(', ')}</span></div>
                <div><span className="text-gray-500">Environments:</span> <span className="font-medium">{plan.impact.affectedEnvironments.join(', ')}</span></div>
                <div><span className="text-gray-500">Estimated Downtime:</span> <span className="font-medium">{plan.impact.downtime}</span></div>
                <div><span className="text-gray-500">Rollback Time:</span> <span className="font-medium">{plan.impact.rollbackTime}</span></div>
              </div>
              <div className="space-y-1.5">
                <div><span className="text-gray-500">Client Impact:</span> <span className="font-medium">{plan.impact.clientImpact}</span></div>
                <div><span className="text-gray-500">Data Risk:</span> <span className="font-medium">{plan.impact.dataRisk}</span></div>
                <div><span className="text-gray-500">Dependencies:</span> <span className="font-medium">{plan.impact.dependencies.join(', ')}</span></div>
              </div>
            </div>
          </div>
        )}

        {plan.phase === 'approval-pending' && (
          <div className="flex gap-3">
            <button onClick={approveAndExecute} disabled={busy} className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-xs font-medium py-2.5 rounded-lg transition">
              {busy ? 'Starting…' : '✓ Approve & Start Execution'}
            </button>
            <button onClick={() => setPlan(p => ({ ...p, phase: 'idle' }))} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium py-2.5 rounded-lg transition">
              ✕ Reject — Too Risky
            </button>
          </div>
        )}

        {(plan.phase === 'executing' || plan.phase === 'validating' || plan.phase === 'completed' || plan.phase === 'rolled-back' || plan.phase === 'failed') && (
          <div>
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Execution Steps — real, operator-confirmed</p>
            <div className="space-y-2">
              {plan.steps.map((step) => (
                <div key={step.id} className="border rounded-lg p-3">
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${stepColors[step.status]}`}>
                      {step.status === 'passed' ? '✓' : step.status === 'failed' ? '✕' : step.status === 'in-progress' ? '●' : '○'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium ${step.status === 'in-progress' ? 'text-purple-700' : step.status === 'passed' ? 'text-green-700' : step.status === 'failed' ? 'text-red-700' : 'text-gray-500'}`}>{step.label}</p>
                      <p className="text-[10px] text-gray-400">{step.description}</p>
                      {step.note && <p className="text-[10px] text-gray-500 mt-0.5">Note: {step.note}</p>}
                    </div>
                    {step.duration && <span className="text-[10px] text-gray-400 shrink-0">{step.duration}</span>}
                  </div>
                  {plan.phase === 'executing' && step.status === 'pending' && (
                    <button onClick={() => startStep(step.id)} disabled={busy} className="mt-2 text-[10px] font-medium text-purple-600 hover:text-purple-800 disabled:text-gray-300">Start this step →</button>
                  )}
                  {plan.phase === 'executing' && step.status === 'in-progress' && (
                    <div className="mt-2 flex items-center gap-2">
                      <input value={noteDrafts[step.id] || ''} onChange={e => setNoteDrafts(d => ({ ...d, [step.id]: e.target.value }))} placeholder="Evidence / note (optional)" className="flex-1 text-[10px] border rounded px-2 py-1" />
                      <button onClick={() => completeStep(step.id)} disabled={busy} className="text-[10px] font-medium text-green-700 hover:text-green-900 disabled:text-gray-300">Mark Complete</button>
                      <button onClick={() => failStep(step.id)} disabled={busy} className="text-[10px] font-medium text-red-600 hover:text-red-800 disabled:text-gray-300">Mark Failed</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {anyStepFailed && (
              <p className="mt-2 text-[10px] text-red-600">One or more steps failed. Resolve manually or escalate before continuing.</p>
            )}
          </div>
        )}

        {plan.phase === 'validating' && allStepsDone && (
          <div className="border border-green-200 bg-green-50 rounded-lg p-4">
            <p className="text-sm font-semibold text-green-700 mb-1">✓ All steps complete</p>
            <p className="text-[10px] text-gray-500 mb-3">Approved by: {plan.approvedBy || '—'}. Awaiting verification before the remediation is marked complete.</p>
            <p className="text-xs font-semibold text-gray-800 mb-1">Verify & Close Ticket</p>
            <p className="text-[10px] text-gray-600 mb-3">Confirm the issue is genuinely resolved before closing.</p>
            <div className="flex gap-2">
              <button onClick={() => setUserVerdict('resolved')} className={`flex-1 text-xs font-medium py-2.5 rounded-lg transition ${userVerdict === 'resolved' ? 'bg-green-700 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>✓ Verified — Resolved</button>
              <button onClick={() => setUserVerdict('not-resolved')} className={`flex-1 text-xs font-medium py-2.5 rounded-lg transition ${userVerdict === 'not-resolved' ? 'bg-orange-700 text-white' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}>✕ Issue Persists</button>
            </div>
            {userVerdict === 'resolved' && (
              <button onClick={closeTicket} disabled={busy} className="mt-3 w-full bg-green-700 hover:bg-green-800 disabled:bg-gray-300 text-white text-xs font-semibold py-2.5 rounded-lg transition">
                {busy ? 'Closing…' : 'Close Ticket & Mark as Fixed ✓'}
              </button>
            )}
            {userVerdict === 'not-resolved' && (
              <p className="mt-3 text-[10px] text-orange-700">Issue not resolved — escalate or start a new remediation attempt from the incident page.</p>
            )}
          </div>
        )}

        {plan.ticketClosed && (
          <div className="border border-green-300 bg-gradient-to-b from-green-50 to-white rounded-lg p-5 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3"><span className="text-xl">✓</span></div>
            <p className="text-sm font-bold text-green-800">Incident Closed — Resolved</p>
            <p className="text-[10px] text-green-600 mt-1">Fix verified, ticket moved to <span className="font-bold">Fixed</span>.</p>
          </div>
        )}

        {(plan.phase === 'executing' || plan.phase === 'validating') && (
          <div className="text-[10px] text-gray-400 flex items-center gap-1.5 pt-2 border-t">
            <span>🛡️</span>
            <span>Rollback plan: {plan.rollbackPlan}</span>
          </div>
        )}
      </div>
    </section>
  );
}
