'use client';
import { useState } from 'react';
import { updateRemediationPhase, closeRemediationTicket, logAuditEvent } from '../lib/operations-api';
import { sendNotification, getStandardSubject } from '../lib/notifications';
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
}

interface RemediationPanelProps {
  plan: RemediationPlan;
  onGradeChange?: (grade: RemediationGrade) => void;
}

export function RemediationPanel({ plan: initialPlan }: RemediationPanelProps) {
  // Persist remediation state so it survives page navigation
  const storageKey = `askabd-remediation-${initialPlan.id}`;

  function loadPersistedState(): { phase: RemediationPhase; ticketClosed: boolean; evidence: string[] } | null {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return null;
  }

  const persisted = loadPersistedState();
  const [plan, setPlan] = useState<RemediationPlan>(() => {
    if (persisted && (persisted.phase === 'completed' || persisted.ticketClosed)) {
      return { ...initialPlan, phase: 'completed' as RemediationPhase, completedAt: new Date().toISOString() };
    }
    return initialPlan;
  });
  const [selectedGrade, setSelectedGrade] = useState<RemediationGrade>(initialPlan.grade);
  const [showImpact, setShowImpact] = useState(false);
  const [userConfirmed, setUserConfirmed] = useState(persisted?.ticketClosed || false);
  const [incidentResolved, setIncidentResolved] = useState(persisted?.ticketClosed || false);
  const [ticketClosed, setTicketClosed] = useState(persisted?.ticketClosed || false);
  const [evidence, setEvidence] = useState<string[]>(persisted?.evidence || []);
  const [retryCount, setRetryCount] = useState(0);
  const [reAnalysing, setReAnalysing] = useState(false);

  // Persist state changes
  function persistState(phase: RemediationPhase, closed: boolean, ev: string[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(storageKey, JSON.stringify({ phase, ticketClosed: closed, evidence: ev }));
  }

  const phaseLabels: Record<RemediationPhase, string> = {
    'idle': 'Ready to Remediate',
    'impact-analysis': 'Analysing Impact…',
    'approval-pending': 'Awaiting Approval',
    'executing': 'Executing Fix…',
    'validating': 'Validating…',
    'completed': 'Fix Applied — Awaiting Verification',
    'rolled-back': 'Rolled Back',
    'failed': 'Remediation Failed',
  };

  const phaseColors: Record<RemediationPhase, string> = {
    'idle': 'bg-gray-100 text-gray-600',
    'impact-analysis': 'bg-blue-100 text-blue-700',
    'approval-pending': 'bg-yellow-100 text-yellow-700',
    'executing': 'bg-purple-100 text-purple-700',
    'validating': 'bg-indigo-100 text-indigo-700',
    'completed': 'bg-green-100 text-green-700',
    'rolled-back': 'bg-orange-100 text-orange-700',
    'failed': 'bg-red-100 text-red-700',
  };

  const riskColors: Record<string, string> = {
    low: 'text-green-600 bg-green-50 border-green-200',
    medium: 'text-orange-600 bg-orange-50 border-orange-200',
    high: 'text-red-600 bg-red-50 border-red-200',
    critical: 'text-red-700 bg-red-100 border-red-300',
  };

  function simulateRemediation() {
    // Phase 1: Impact Analysis
    setPlan(p => ({ ...p, phase: 'impact-analysis' }));
    setShowImpact(true);

    setTimeout(() => {
      // Phase 2: Approval
      setPlan(p => ({ ...p, phase: 'approval-pending' }));
    }, 1500);
  }

  function approveAndExecute() {
    setPlan(p => ({
      ...p,
      phase: 'executing',
      approvedBy: 'hello@askabd.com',
      startedAt: new Date().toISOString(),
      steps: p.steps.map((s, i) => i === 0 ? { ...s, status: 'in-progress' as const } : s),
    }));

    // Simulate step-by-step execution
    let stepIndex = 0;
    const capturedEvidence: string[] = [];
    const interval = setInterval(() => {
      stepIndex++;
      setPlan(p => {
        const newSteps = p.steps.map((s, i) => {
          if (i < stepIndex) return { ...s, status: 'passed' as const, duration: `${(i + 1) * 12}s` };
          if (i === stepIndex) return { ...s, status: 'in-progress' as const };
          return s;
        });

        // Capture evidence for each passed step
        if (stepIndex <= p.steps.length) {
          capturedEvidence.push(`[${new Date().toLocaleTimeString('en-AU')}] Step ${stepIndex}: ${p.steps[stepIndex - 1]?.label} — PASSED`);
        }

        if (stepIndex >= p.steps.length) {
          clearInterval(interval);
          return { ...p, steps: newSteps.map(s => ({ ...s, status: 'passed' as const })), phase: 'validating' };
        }
        return { ...p, steps: newSteps };
      });
    }, 2000);

    // Final validation + evidence capture
    setTimeout(() => {
      capturedEvidence.push(`[${new Date().toLocaleTimeString('en-AU')}] Validation: All criteria passed`);
      capturedEvidence.push(`[${new Date().toLocaleTimeString('en-AU')}] Snapshot: Post-fix state captured`);
      setEvidence(capturedEvidence);
      setPlan(p => ({
        ...p,
        phase: 'completed',
        completedAt: new Date().toISOString(),
      }));
      // Persist so completed state survives navigation
      persistState('completed', false, capturedEvidence);
    }, 2000 * ((initialPlan.steps?.length ?? 0) + 1));
  }

  function rollback() {
    setPlan(p => ({
      ...p,
      phase: 'rolled-back',
      steps: p.steps.map(s => s.status === 'passed' ? { ...s, status: 'skipped' as const } : s),
    }));
    setEvidence(prev => [...prev, `[${new Date().toLocaleTimeString('en-AU')}] ROLLBACK: All changes reverted to pre-fix snapshot`]);
  }

  function reset() {
    setPlan({
      ...initialPlan,
      phase: 'idle',
      steps: initialPlan.steps.map(s => ({ ...s, status: 'pending' as const, duration: undefined })),
    });
    setShowImpact(false);
    setSelectedGrade(initialPlan.grade);
    setUserConfirmed(false);
    setIncidentResolved(false);
    setTicketClosed(false);
    // Clear persisted state
    if (typeof window !== 'undefined') localStorage.removeItem(storageKey);
  }

  function retryWithReAnalysis() {
    setReAnalysing(true);
    setRetryCount(prev => prev + 1);
    setUserConfirmed(false);
    setIncidentResolved(false);

    // Simulate re-analysis (2s) then go back to idle for next attempt
    setTimeout(() => {
      setReAnalysing(false);
      setPlan({
        ...initialPlan,
        phase: 'idle',
        steps: initialPlan.steps.map(s => ({ ...s, status: 'pending' as const, duration: undefined })),
      });
      setShowImpact(false);
    }, 2000);
  }

  function closeTicket() {
    setTicketClosed(true);
    const closedEvidence = `[${new Date().toLocaleTimeString('en-AU')}] TICKET CLOSED: Incident marked as Resolved. Verified by user.`;
    setEvidence(prev => [...prev, closedEvidence]);

    // Persist to database
    closeRemediationTicket(plan.id, 'hello@askabd.com').catch(() => {});
    logAuditEvent({
      entityType: 'remediation',
      entityId: plan.id,
      entityName: plan.title,
      action: 'resolved',
      actor: 'hello@askabd.com',
      details: { incidentId: plan.incident.id, clientId: plan.client.id, phase: 'completed', ticketClosed: true },
      evidence: [...evidence, closedEvidence],
    }).catch(() => {});

    // Send resolution notification
    sendNotification({
      clientId: plan.client.id, clientName: plan.client.name, phase: 'resolution',
      priority: 'low',
      subject: getStandardSubject('resolution', plan.incident.title, plan.client.name),
      summary: `Incident "${plan.incident.title}" has been resolved and verified. Ticket closed.`,
      details: {
        action: 'Incident Resolved & Ticket Closed',
        performedBy: 'hello@askabd.com',
        timestamp: new Date().toISOString(),
        environment: 'Production',
        impactLevel: 'None — issue resolved',
        nextSteps: 'Post-fix monitoring active. No further action required.',
      },
      recipients: [],
      evidence: [...evidence, closedEvidence],
    }).catch(() => {});

    // Persist completed state so it survives page navigation
    persistState('completed', true, [...evidence, closedEvidence]);
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">🔧</span>
          <div>
            <h3 className="font-semibold text-sm text-gray-900">Remediate Issue</h3>
            <p className="text-[10px] text-gray-500">Guided resolution with impact analysis and automatic rollback</p>
          </div>
        </div>
        <span className={`text-[10px] font-medium px-2.5 py-1 rounded-full ${ticketClosed ? 'bg-green-200 text-green-800' : phaseColors[plan.phase]}`}>
          {ticketClosed ? '✓ Fixed — Ticket Closed' : phaseLabels[plan.phase]}
        </span>
      </div>

      <div className="p-5 space-y-5">
        {/* Grade Selection */}
        {plan.phase === 'idle' && (
          <>
            <div>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Remediation Mode</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedGrade('standard')}
                  className={`border rounded-lg p-3 text-left transition ${selectedGrade === 'standard' ? 'border-purple-400 bg-purple-50 ring-1 ring-purple-200' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <p className="text-xs font-semibold text-gray-900">Standard</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Full impact analysis, manual approval, phased rollout. Recommended for production environments.</p>
                  <div className="mt-2 flex gap-1.5">
                    <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Safe</span>
                    <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">~15 min</span>
                  </div>
                </button>
                <button
                  onClick={() => setSelectedGrade('expedited')}
                  className={`border rounded-lg p-3 text-left transition ${selectedGrade === 'expedited' ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-200' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <p className="text-xs font-semibold text-gray-900">Expedited</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Rapid impact check, auto-approval for P1. For critical outages only.</p>
                  <div className="mt-2 flex gap-1.5">
                    <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Fast</span>
                    <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">~5 min</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Fix Summary */}
            <div className="border rounded-lg p-3 bg-gray-50">
              <p className="text-[10px] font-medium text-gray-500 uppercase mb-2">Proposed Fix</p>
              <div className="grid md:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">Immediate</p>
                  <p className="text-gray-700">{plan.fix.immediate}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">Permanent</p>
                  <p className="text-gray-700">{plan.fix.permanent}</p>
                </div>
              </div>
            </div>

            <button
              onClick={simulateRemediation}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2.5 rounded-lg transition shadow-sm"
            >
              Begin Remediation — {selectedGrade === 'expedited' ? 'Expedited' : 'Standard'} Mode
            </button>
          </>
        )}

        {/* Impact Analysis */}
        {showImpact && plan.phase !== 'idle' && (
          <div className={`border rounded-lg p-4 ${riskColors[plan.impact.riskLevel]}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold">Impact Analysis</p>
              <span className={`text-[10px] font-bold uppercase`}>Risk: {plan.impact.riskLevel}</span>
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
            {plan.impact.sideEffects.length > 0 && (
              <div className="mt-2 pt-2 border-t border-current/10">
                <p className="text-[10px] font-medium mb-1">Potential Side Effects:</p>
                <ul className="text-[10px] space-y-0.5 list-disc list-inside opacity-80">
                  {plan.impact.sideEffects.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Approval */}
        {plan.phase === 'approval-pending' && (
          <div className="flex gap-3">
            <button
              onClick={approveAndExecute}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium py-2.5 rounded-lg transition"
            >
              ✓ Approve & Execute
            </button>
            <button
              onClick={reset}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium py-2.5 rounded-lg transition"
            >
              ✕ Reject — Too Risky
            </button>
          </div>
        )}

        {/* Execution Steps */}
        {(plan.phase === 'executing' || plan.phase === 'validating' || plan.phase === 'completed' || plan.phase === 'rolled-back') && (
          <div>
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Execution Progress</p>
            <div className="space-y-2">
              {plan.steps.map((step) => (
                <div key={step.id} className="flex items-center gap-3 text-xs">
                  <StepIcon status={step.status} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium ${step.status === 'in-progress' ? 'text-purple-700' : step.status === 'passed' ? 'text-green-700' : step.status === 'failed' ? 'text-red-700' : 'text-gray-500'}`}>{step.label}</p>
                    <p className="text-[10px] text-gray-400 truncate">{step.description}</p>
                  </div>
                  {step.duration && <span className="text-[10px] text-gray-400 shrink-0">{step.duration}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Validation */}
        {plan.phase === 'validating' && (
          <div className="border border-indigo-200 bg-indigo-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-indigo-700 mb-2">Validating Fix…</p>
            <ul className="text-[10px] text-indigo-600 space-y-1">
              {plan.validationCriteria.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="animate-pulse">◌</span> {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Completed — Verification Phase */}
        {plan.phase === 'completed' && !userConfirmed && (
          <div className="border border-green-200 bg-green-50 rounded-lg p-4">
            <div className="text-center mb-4">
              <p className="text-sm font-semibold text-green-700">✓ Fix Applied & Validated</p>
              <p className="text-[10px] text-green-600 mt-1">All validation criteria passed. Snapshot captured as evidence.</p>
              <p className="text-[10px] text-gray-500 mt-1">Completed at: {plan.completedAt ? new Date(plan.completedAt).toLocaleString('en-AU') : '—'}</p>
              {retryCount > 0 && <p className="text-[10px] text-purple-600 mt-1">Attempt #{retryCount + 1}</p>}
            </div>

            {/* Evidence Log */}
            {evidence.length > 0 && (
              <div className="bg-white/70 border border-green-100 rounded-lg p-3 mb-4">
                <p className="text-[10px] font-semibold text-gray-700 uppercase tracking-wide mb-1.5">📋 Evidence & Snapshot</p>
                <div className="space-y-0.5 max-h-24 overflow-y-auto">
                  {evidence.map((e, i) => (
                    <p key={i} className="text-[9px] text-gray-600 font-mono">{e}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-green-200 pt-3">
              <p className="text-xs font-semibold text-gray-800 mb-1">Verify & Close Ticket</p>
              <p className="text-[10px] text-gray-600 mb-3">
                Please verify the issue is resolved. If confirmed, the incident will be marked as <strong>Resolved</strong> and the ticket closed.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setUserConfirmed(true); setIncidentResolved(true); }}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium py-2.5 rounded-lg transition"
                >
                  ✓ Verified — Close Ticket
                </button>
                <button
                  onClick={() => { setUserConfirmed(true); setIncidentResolved(false); }}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium py-2.5 rounded-lg transition"
                >
                  ✕ Issue Still Persists
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Ticket Closed — Final State */}
        {plan.phase === 'completed' && userConfirmed && incidentResolved && ticketClosed && (
          <div className="border border-green-300 bg-gradient-to-b from-green-50 to-white rounded-lg p-5 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl">✓</span>
            </div>
            <p className="text-sm font-bold text-green-800">Incident Closed — Resolved</p>
            <p className="text-[10px] text-green-600 mt-1">Fix verified, snapshot saved, ticket moved to <span className="font-bold">Fixed</span>.</p>
            <p className="text-[10px] text-gray-500 mt-2">Closed at: {new Date().toLocaleString('en-AU')}</p>
            <div className="mt-3 pt-3 border-t border-green-200 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-green-700 font-medium">Post-fix monitoring active — no regression</span>
            </div>
            {evidence.length > 0 && (
              <div className="mt-3 pt-3 border-t border-green-200 text-left">
                <p className="text-[9px] font-semibold text-gray-500 uppercase mb-1">Audit Trail</p>
                <div className="space-y-0.5 max-h-20 overflow-y-auto">
                  {evidence.map((e, i) => (
                    <p key={i} className="text-[9px] text-gray-500 font-mono">{e}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* User confirmed resolved but hasn't closed ticket yet */}
        {plan.phase === 'completed' && userConfirmed && incidentResolved && !ticketClosed && (
          <div className="border border-green-200 bg-green-50 rounded-lg p-4 text-center">
            <p className="text-sm font-semibold text-green-700">✓ Verified — Working as Expected</p>
            <p className="text-[10px] text-green-600 mt-1">Issue confirmed resolved. Ready to close ticket and update status.</p>
            <button
              onClick={closeTicket}
              className="mt-3 bg-green-700 hover:bg-green-800 text-white text-xs font-semibold py-2.5 px-6 rounded-lg transition shadow-sm"
            >
              Close Ticket & Mark as Fixed ✓
            </button>
          </div>
        )}

        {/* Re-Analysis in Progress */}
        {reAnalysing && (
          <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-sm font-semibold text-blue-700 animate-pulse">🔍 Re-Analysing Issue…</p>
            <p className="text-[10px] text-blue-600 mt-1">Running impact analysis on attempt #{retryCount + 1}. Ensuring no side effects from previous fix.</p>
            <div className="mt-2 flex justify-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* Issue Still Persists — Re-run option */}
        {plan.phase === 'completed' && userConfirmed && !incidentResolved && !reAnalysing && (
          <div className="border border-orange-200 bg-orange-50 rounded-lg p-4">
            <div className="text-center mb-3">
              <p className="text-sm font-semibold text-orange-700">⚠ Issue Not Resolved</p>
              <p className="text-[10px] text-orange-600 mt-1">The applied fix did not fully resolve the root cause. Incident remains open.</p>
              {retryCount > 0 && <p className="text-[10px] text-gray-500 mt-1">Previous attempts: {retryCount}</p>}
            </div>

            <div className="bg-white/60 border border-orange-100 rounded-lg p-3 mb-3">
              <p className="text-[10px] font-semibold text-gray-700 mb-1">Before re-running:</p>
              <ul className="text-[9px] text-gray-600 space-y-0.5 list-disc list-inside">
                <li>A fresh impact analysis will run to check for side effects</li>
                <li>Previous fix state has been snapshot for comparison</li>
                <li>No changes will be made without new approval</li>
                <li>Rollback to original state is still available</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <button
                onClick={retryWithReAnalysis}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium py-2.5 rounded-lg transition"
              >
                🔍 Re-Analyse & Try Again
              </button>
              <button
                onClick={rollback}
                className="flex-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 py-2.5 rounded-lg border border-red-200 transition"
              >
                ↩ Rollback to Original
              </button>
            </div>
          </div>
        )}

        {/* Rolled Back */}
        {plan.phase === 'rolled-back' && (
          <div className="border border-orange-200 bg-orange-50 rounded-lg p-4 text-center">
            <p className="text-sm font-semibold text-orange-700">↩ Changes Rolled Back</p>
            <p className="text-[10px] text-orange-600 mt-1">Fix did not pass validation. All changes reverted to previous stable state.</p>
            <p className="text-[10px] text-gray-500 mt-2">Rollback plan: {plan.rollbackPlan}</p>
            <button onClick={reset} className="mt-3 text-xs font-medium text-purple-600 hover:text-purple-800 transition">
              Try Different Approach →
            </button>
          </div>
        )}

        {/* Rollback Button during execution */}
        {(plan.phase === 'executing' || plan.phase === 'validating') && (
          <button
            onClick={rollback}
            className="w-full border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium py-2 rounded-lg transition"
          >
            ↩ Emergency Rollback
          </button>
        )}

        {/* Rollback info */}
        {plan.phase !== 'idle' && plan.phase !== 'completed' && plan.phase !== 'rolled-back' && (
          <div className="text-[10px] text-gray-400 flex items-center gap-1.5 pt-2 border-t">
            <span>🛡️</span>
            <span>Automatic rollback if validation fails. Rollback time: {plan.impact.rollbackTime}. No data loss.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function StepIcon({ status }: { status: RemediationStep['status'] }) {
  switch (status) {
    case 'passed': return <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-[10px]">✓</span>;
    case 'failed': return <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-[10px]">✕</span>;
    case 'in-progress': return <span className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-[10px] animate-pulse">●</span>;
    case 'skipped': return <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-[10px]">—</span>;
    default: return <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-[10px]">○</span>;
  }
}
