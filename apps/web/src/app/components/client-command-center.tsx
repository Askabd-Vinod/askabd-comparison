'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getLifecycleState, fetchServerLifecycle, statusMeta, getProgress,
  type LifecycleState, type LifecycleStatus
} from '../lib/onboarding-lifecycle';
import {
  calculateClientDeliveryStatus, getServiceForStatus, connectorRequirements,
  type ClientDeliveryStatus, type RequiredConnector, type ServiceRequirement
} from '../lib/service-readiness';
import { logAuditEvent } from '../lib/operations-api';
import { RequirementWorkspace } from './requirement-workspace';
import { PhaseHeader, type PhaseStatus } from './phase-header';

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
  const [connStates, setConnStates] = useState<Record<string, 'not-configured' | 'configured' | 'testing' | 'connected' | 'failed'>>({});
  const [connFields, setConnFields] = useState<Record<string, Record<string, string>>>({});
  const [testResult, setTestResult] = useState<Record<string, { checks: { step: string; pass: boolean }[]; error?: string; mode?: 'real' | 'demo' }>>({});

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
    // Load saved connector states
    try {
      const saved = localStorage.getItem(`askabd-conn-${clientId}`);
      if (saved) { const p = JSON.parse(saved); setConnStates(p.states || {}); setConnFields(p.fields || {}); }
    } catch { /* skip */ }
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

  function saveConnState(newStates: typeof connStates, newFields: typeof connFields) {
    setConnStates(newStates);
    setConnFields(newFields);
    localStorage.setItem(`askabd-conn-${clientId}`, JSON.stringify({ states: newStates, fields: newFields }));
  }

  function handleFieldChange(provider: string, field: string, value: string) {
    const next = { ...connFields, [provider]: { ...(connFields[provider] || {}), [field]: value } };
    setConnFields(next);
  }

  async function testConnection(conn: RequiredConnector) {
    const fields = connFields[conn.provider] || {};
    const newStates = { ...connStates, [conn.provider]: 'testing' as const };
    saveConnState(newStates, connFields);
    setTestResult(prev => ({ ...prev, [conn.provider]: undefined as any }));

    // Call REAL backend API for connection testing
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
    try {
      const res = await fetch(`${API}/api/v1/oc/connectors/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: conn.provider, clientId, fields }),
      });

      if (res.ok) {
        const result = await res.json();
        const finalState = result.status === 'connected' ? 'connected' : 'failed';
        const finalStates = { ...connStates, [conn.provider]: finalState as any };
        saveConnState(finalStates, connFields);
        setTestResult(prev => ({
          ...prev,
          [conn.provider]: {
            checks: result.steps.map((s: any) => ({ step: s.step, pass: s.pass, error: s.error })),
            error: result.error,
            mode: result.mode,
          }
        }));
      } else {
        const finalStates = { ...connStates, [conn.provider]: 'failed' as any };
        saveConnState(finalStates, connFields);
        setTestResult(prev => ({ ...prev, [conn.provider]: { checks: [{ step: 'API Request', pass: false }], error: 'Connection test API returned an error' } }));
      }
    } catch (err) {
      // Retry once silently before showing error
      try {
        await new Promise(r => setTimeout(r, 2000));
        const retryRes = await fetch(API + '/api/v1/oc/connectors/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: conn.provider, clientId, fields: connFields[conn.provider] || {} }),
        });
        if (retryRes.ok) {
          const result = await retryRes.json();
          const finalState = result.status === 'connected' ? 'connected' : 'failed';
          const finalStates = { ...connStates, [conn.provider]: finalState as any };
          saveConnState(finalStates, connFields);
          setTestResult(prev => ({
            ...prev,
            [conn.provider]: {
              checks: result.steps.map((s: any) => ({ step: s.step, pass: s.pass, error: s.error })),
              error: result.error,
              mode: result.mode,
            }
          }));
          return;
        }
      } catch { /* retry also failed */ }
      const finalStates = { ...connStates, [conn.provider]: 'failed' as any };
      saveConnState(finalStates, connFields);
      setTestResult(prev => ({ ...prev, [conn.provider]: { checks: [{ step: 'Connectivity', pass: false }], error: 'Service temporarily unavailable. Please wait and retry.' } }));
    }
  }

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

      {/* Required Connections — Configuration & Testing */}
      {currentService && currentService.requiredConnectors.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h4 className="text-xs font-bold text-gray-900 mb-3">🔌 Required Connections</h4>
          <div className="space-y-4">
            {currentService.requiredConnectors.map((conn) => {
              const cState = connStates[conn.provider] || 'not-configured';
              const fields = connFields[conn.provider] || {};
              const results = testResult[conn.provider];
              return (
                <div key={conn.provider} className={`rounded-lg border p-4 ${cState === 'connected' ? 'border-green-200 bg-green-50/30' : cState === 'failed' ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-bold text-gray-800">{conn.provider}</p>
                      <p className="text-[10px] text-gray-500">{conn.purpose}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${conn.securityLevel === 'read-only' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{conn.securityLevel}</span>
                      <span className={`w-2.5 h-2.5 rounded-full ${cState === 'connected' ? 'bg-green-500' : cState === 'failed' ? 'bg-red-500' : cState === 'testing' ? 'bg-yellow-500 animate-pulse' : 'bg-gray-300'}`} />
                      <span className={`text-[9px] font-medium ${cState === 'connected' ? 'text-green-600' : cState === 'failed' ? 'text-red-600' : cState === 'testing' ? 'text-yellow-600' : 'text-gray-400'}`}>
                        {cState === 'connected' ? 'Connected' : cState === 'failed' ? 'Failed' : cState === 'testing' ? 'Testing...' : cState === 'configured' ? 'Configured' : 'Not Configured'}
                      </span>
                    </div>
                  </div>

                  {/* Why needed */}
                  <p className="text-[9px] text-gray-500 mb-3 italic">{conn.whyNeeded}</p>

                  {/* Configuration Fields */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {conn.requiredFields.map(f => (
                      <div key={f.field}>
                        <label className="text-[9px] text-gray-500 font-medium">{f.label}</label>
                        <input
                          type={f.sensitive ? 'password' : 'text'}
                          placeholder={f.placeholder}
                          value={fields[f.field] || ''}
                          onChange={e => handleFieldChange(conn.provider, f.field, e.target.value)}
                          className="w-full mt-0.5 border rounded px-2 py-1 text-[10px] focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Test Connection Button */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => testConnection(conn)}
                      disabled={cState === 'testing'}
                      className="text-[10px] font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded transition"
                    >
                      {cState === 'testing' ? 'Testing...' : 'Test Connection'}
                    </button>
                    {cState === 'configured' || Object.keys(fields).length > 0 ? (
                      <button onClick={() => { const ns = {...connStates, [conn.provider]: 'configured' as const}; saveConnState(ns, connFields); }} className="text-[10px] text-gray-500 hover:text-gray-700">Save Configuration</button>
                    ) : null}
                  </div>

                  {/* Validation Results */}
                  {results && (
                    <div className="mt-3 pt-2 border-t space-y-1">
                      {results.mode && <p className="text-[8px] font-bold uppercase text-gray-400 mb-1">{results.mode === 'demo' ? '⚠ DEMO MODE — SIMULATED' : '✓ REAL VALIDATION'}</p>}
                      {results.checks.map((c: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-[9px]">
                          <span className={`w-3 h-3 rounded-full flex items-center justify-center ${c.pass ? 'bg-green-500' : 'bg-red-500'}`}>
                            <span className="text-white text-[7px] font-bold">{c.pass ? '✓' : '✗'}</span>
                          </span>
                          <span className={c.pass ? 'text-green-700' : 'text-red-700'}>{c.step}</span>
                          <span className={`ml-auto font-medium ${c.pass ? 'text-green-600' : 'text-red-600'}`}>{c.pass ? 'PASS' : 'FAIL'}</span>
                        </div>
                      ))}
                      {results.error && (
                        <div className="mt-2 bg-red-50 border border-red-200 rounded p-2">
                          <p className="text-[9px] text-red-700 font-medium">Failed: {results.error}</p>
                          <p className="text-[9px] text-red-600 mt-0.5">Resolution: Verify credentials, network access, and permissions. Then retry.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
        <Link href={`/clients/${clientId}/edit`} className="text-xs text-gray-600 hover:text-purple-600 font-medium">Edit Client</Link>
      </div>
    </div>
  );
}
