'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getLifecycleState, fetchServerLifecycle, statusMeta, getProgress,
  type LifecycleState, type LifecycleStatus
} from '../lib/onboarding-lifecycle';
import {
  calculateClientDeliveryStatus, getServiceForStatus,
  type ClientDeliveryStatus, type ServiceRequirement
} from '../lib/service-readiness';
import { logAuditEvent } from '../lib/operations-api';
import { RequirementWorkspace } from './requirement-workspace';
import { PhaseHeader, type PhaseStatus } from './phase-header';

interface RelevantConnector {
  connectorId: string; connectorName: string; category: string;
  classification: 'required' | 'optional'; status: string; lastTestedAt: string | null;
}

/** Maps the real 27-stage lifecycle model onto the shared PhaseHeader's fixed
 *  status vocabulary. The lifecycle itself has no "blocked" concept today —
 *  a customer-action-required stage still counts as in_progress, since the
 *  overall client engagement IS progressing, just waiting on an owner. */
function toPhaseStatus(order: number): PhaseStatus {
  if (order === 0) return 'not_started';
  if (order >= 23) return 'complete'; // go-live and every steady-state stage after it
  return 'in_progress';
}

interface Props {
  clientId: string;
  clientName: string;
}

export function ClientCommandCenter({ clientId, clientName }: Props) {
  const [state, setState] = useState<LifecycleState | null>(null);
  const [delivery, setDelivery] = useState<ClientDeliveryStatus | null>(null);
  const [relevantConnectors, setRelevantConnectors] = useState<RelevantConnector[] | null>(null);

  useEffect(() => {
    const ls = getLifecycleState(clientId);
    setState(ls);
    if (ls) {
      setDelivery(calculateClientDeliveryStatus(clientId, clientName, ls.status));
    }
    // Fetch authoritative state from server
    fetchServerLifecycle(clientId).then(serverState => {
      if (serverState) {
        setState(serverState);
        setDelivery(calculateClientDeliveryStatus(clientId, clientName, serverState.status));
      }
    });
    // Real, per-client connector relevance — the same authoritative source
    // (ServiceRequirementMatrixService) the dedicated /clients/:id/connectors page uses.
    // Never the static, generic per-lifecycle-stage list this component used to show.
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
    fetch(`${API}/api/v1/oc/clients/${clientId}/onboarding/requirements`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setRelevantConnectors(data.relevantConnectors || []); })
      .catch(() => { /* leave null — rendered as "not yet available", never fabricated */ });
  }, [clientId, clientName]);

  if (!state || !delivery) {
    return (
      <div className="bg-white rounded-xl border p-5">
        <p className="text-xs text-gray-500">No lifecycle state. <Link href="/clients/onboard" className="text-purple-600 font-medium">Start onboarding →</Link></p>
      </div>
    );
  }

  const currentService = delivery.currentService;
  const progress = delivery.progress;
  const currentStep = statusMeta[state.status];
  const ownerColors: Record<string, string> = {
    client: 'bg-amber-100 text-amber-700',
    askabd: 'bg-purple-100 text-purple-700',
    automatic: 'bg-blue-100 text-blue-700',
    approval: 'bg-red-100 text-red-700',
  };
  const ownerLabels: Record<string, string> = {
    client: 'CLIENT ACTION REQUIRED',
    askabd: 'ASKABD ACTION',
    automatic: 'AUTOMATIC',
    approval: 'APPROVAL REQUIRED',
  };

  // Check if lifecycle page has actionable phase
  const lifecycleUrl = `/clients/${clientId}/lifecycle`;

  return (
    <div className="space-y-4">
      {/* Header — Current Delivery Status, using the shared AskABD PhaseHeader pattern */}
      <PhaseHeader
        name={currentStep?.label || state.status}
        description={currentStep?.description || ''}
        status={toPhaseStatus(currentStep?.order ?? 0)}
        progress={progress}
        nextAction={{ label: currentStep?.whatNext || 'View Full Lifecycle', href: lifecycleUrl }}
        lastVerified={state.updatedAt ? new Date(state.updatedAt) : undefined}
      />

      {/* Current owner — real, not part of PhaseHeader's fixed vocabulary (client/askabd/automatic/approval is a different axis than status) */}
      <div className="flex items-center gap-2 -mt-2">
        <span className="text-[9px] text-gray-400 uppercase">Current Owner</span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded inline-block ${ownerColors[delivery.currentOwner]}`}>{ownerLabels[delivery.currentOwner]}</span>
      </div>

      {/* Current Service */}
      {currentService && (
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[9px] text-gray-500 uppercase">Current Service</p>
              <h4 className="text-sm font-bold text-purple-700">{currentService.serviceName}</h4>
              <p className="text-[10px] text-gray-500 mt-0.5">{currentService.description}</p>
            </div>
            <span className="text-[9px] font-bold bg-purple-50 text-purple-600 px-2 py-1 rounded">{currentService.estimatedDuration}</span>
          </div>

          {/* What's needed */}
          <div className="grid md:grid-cols-2 gap-4 mt-4 pt-3 border-t">
            {delivery.clientActions.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-amber-700 mb-2">⚡ Client Must Provide</p>
                {delivery.clientActions.map((a, i) => <p key={i} className="text-[10px] text-gray-700 pl-3 border-l-2 border-amber-200 mb-1">{a}</p>)}
              </div>
            )}
            {delivery.askabdActions.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-purple-700 mb-2">🔧 AskABD Will Perform</p>
                {delivery.askabdActions.map((a, i) => <p key={i} className="text-[10px] text-gray-700 pl-3 border-l-2 border-purple-200 mb-1">{a}</p>)}
              </div>
            )}
          </div>

          {/* Success Criteria */}
          <div className="mt-3 pt-3 border-t">
            <p className="text-[9px] text-gray-500 uppercase mb-1">Success Criteria</p>
            <p className="text-[10px] text-gray-700">{currentService.successCriteria}</p>
          </div>

          {/* Expected Output */}
          <div className="mt-2 flex flex-wrap gap-1">
            {currentService.expectedOutput.map((o, i) => <span key={i} className="text-[9px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-100">{o}</span>)}
          </div>

          {/* Security */}
          <p className="text-[9px] text-gray-400 mt-2">🔒 {currentService.securityNote}</p>
        </div>
      )}

      {/* Client Service Requirements — Actionable Workspace */}
      {currentService && (
        <RequirementWorkspace clientId={clientId} serviceId={currentService.serviceId} serviceName={currentService.serviceName} />
      )}

      {/* Required Connections — real, per-client relevance (never a generic static list).
          Configuration and live testing happen on the dedicated Connectors page, which
          already owns that real workflow — this is a status summary, not a second UI. */}
      {relevantConnectors === null ? null : relevantConnectors.length === 0 ? (
        <div className="bg-white rounded-xl border p-5">
          <h4 className="text-xs font-bold text-gray-900 mb-1">🔌 Required Connections</h4>
          <p className="text-[10px] text-gray-500">Not yet available — no services are confirmed for this client yet, so no connector requirements have been calculated.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-gray-900">🔌 Required Connections</h4>
            <Link href={`/clients/${clientId}/connectors`} className="text-[10px] font-semibold text-purple-600 hover:text-purple-800">Configure & Test →</Link>
          </div>
          <div className="space-y-1.5">
            {relevantConnectors.map(conn => (
              <div key={conn.connectorId} className="flex items-center justify-between text-[10px] py-1 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${conn.status === 'connected' ? 'bg-green-500' : conn.status === 'failed' ? 'bg-red-500' : 'bg-gray-300'}`} />
                  <span className="font-medium text-gray-700">{conn.connectorName}</span>
                  {conn.classification === 'required' && <span className="text-[7px] font-bold text-red-500 bg-red-50 px-1 rounded">REQ</span>}
                </div>
                <span className={`font-medium ${conn.status === 'connected' ? 'text-green-600' : conn.status === 'failed' ? 'text-red-600' : 'text-gray-400'}`}>
                  {conn.status === 'connected' ? 'Connected' : conn.status === 'failed' ? 'Failed' : conn.status === 'not_configured' ? 'Not configured' : conn.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action — Go to Lifecycle */}
      <div className="flex items-center gap-3">
        <Link href={lifecycleUrl} className="text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition">
          Continue Lifecycle →
        </Link>
        <Link href={`/clients/${clientId}/services`} className="text-xs text-gray-600 hover:text-purple-600 font-medium">Services</Link>
        <Link href={`/clients/${clientId}/connectors`} className="text-xs text-gray-600 hover:text-purple-600 font-medium">Connectors</Link>
        <Link href={`/clients/${clientId}/invitations`} className="text-xs text-gray-600 hover:text-purple-600 font-medium">Invitations</Link>
        <Link href={`/clients/${clientId}/edit`} className="text-xs text-gray-600 hover:text-purple-600 font-medium">Edit Client</Link>
      </div>
    </div>
  );
}
