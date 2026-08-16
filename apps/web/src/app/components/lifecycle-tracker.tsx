'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getLifecycleState, fetchServerLifecycle, statusMeta, getProgress, getCurrentStepInfo, getNextStep, type LifecycleState, type LifecycleStatus } from '../lib/onboarding-lifecycle';

/**
 * Enterprise Lifecycle Tracker — Workflow-Driven (Read-Only)
 * Reflects the single source of truth from the workflow engine.
 * No manual status changes. No buttons to advance phases.
 */
export function LifecycleTracker({ clientId, clientName }: { clientId?: string; clientName?: string }) {
  const [state, setState] = useState<LifecycleState | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const orgId = clientId || 'default';
    // Immediate render from local cache
    setState(getLifecycleState(orgId));
    // Then fetch authoritative state from server
    fetchServerLifecycle(orgId).then(s => { if (s) setState(s); });
  }, [clientId]);

  if (!state) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">🚀</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Enterprise Lifecycle</p>
              <p className="text-[10px] text-gray-500">No engagement started. Begin by onboarding a new customer.</p>
            </div>
          </div>
          <Link href="/clients/onboard" className="text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-lg transition">Start Onboarding →</Link>
        </div>
      </div>
    );
  }

  const progress = getProgress(state.status);
  const current = getCurrentStepInfo(state.status);
  const next = getNextStep(state.status);
  const currentOrder = current.order;

  // Show a condensed set of phases for the progress bar
  const phases: Array<{ status: LifecycleStatus; order: number }> = [
    { status: 'organization-created', order: 3 }, { status: 'otp-verified', order: 5 },
    { status: 'security-validated', order: 7 }, { status: 'connectors-configured', order: 9 },
    { status: 'discovery-complete', order: 11 }, { status: 'assessment-complete', order: 13 },
    { status: 'recommendations-generated', order: 14 }, { status: 'migration-complete', order: 18 },
    { status: 'validation-passed', order: 20 }, { status: 'audit-passed', order: 22 },
    { status: 'go-live', order: 23 }, { status: 'managed-services', order: 25 },
    { status: 'engineering-intelligence', order: 27 },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <button onClick={() => setExpanded(!expanded)} className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition text-left">
        <div className="flex items-center gap-3">
          <span className="text-lg">🚀</span>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {clientName || state.organizationName}
              <span className={`ml-2 text-[10px] font-medium px-2 py-0.5 rounded ${current.color}`}>{current.label}</span>
            </p>
            <p className="text-[10px] text-gray-500">{current.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-bold text-purple-600">{progress}%</p>
            <p className="text-[9px] text-gray-400">lifecycle</p>
          </div>
          <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Progress bar */}
      <div className="px-5 pb-3">
        <div className="flex gap-0.5">
          {phases.map((p, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${p.order < currentOrder ? 'bg-green-500' : p.order === currentOrder ? 'bg-purple-500' : 'bg-gray-100'}`} title={statusMeta[p.status]?.label || ''} />
          ))}
        </div>
      </div>

      {expanded && (
        <div className="border-t px-5 py-4 space-y-4">
          {/* Current Step Guidance */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-[10px] font-medium text-purple-500 uppercase mb-1">Current Step</p>
            <p className="text-sm font-semibold text-purple-900">{current.label}</p>
            <p className="text-xs text-purple-700 mt-1">{current.description}</p>
            <div className="grid grid-cols-2 gap-3 mt-3 text-[10px]">
              <div><span className="text-purple-500 font-medium">Why:</span> <span className="text-purple-700">{current.why}</span></div>
              <div><span className="text-purple-500 font-medium">Success:</span> <span className="text-purple-700">{current.successCriteria}</span></div>
            </div>
          </div>

          {/* Next Step */}
          {next && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] font-medium text-gray-500 uppercase mb-1">What Happens Next</p>
              <p className="text-xs font-semibold text-gray-800">{next.label}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">{next.whatNext}</p>
            </div>
          )}

          {/* Event timeline (last 5) */}
          {(state.events?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-medium text-gray-500 uppercase mb-2">Recent Events</p>
              <div className="space-y-1">
                {(state.events ?? []).slice(-5).reverse().map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                    <span className="text-gray-600">{e.event.replace(/_/g, ' ')}</span>
                    <span className="text-gray-400 ml-auto">{new Date(e.timestamp).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
