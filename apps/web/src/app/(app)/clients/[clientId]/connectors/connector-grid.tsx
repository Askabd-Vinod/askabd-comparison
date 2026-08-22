'use client';
import { useId, useState } from 'react';
import { connectorCatalog } from '../../../../lib/connectors';
import { EvidenceBadge, EvidenceTrail, connectionEvidenceStatus } from '../../../../components/evidence-status';
import { Action } from '../../../../components/button';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface ValidationStep { step: string; pass: boolean; durationMs: number; error?: string }
interface RealConnector {
  id: string; provider: string; name: string; status: string; security_level: string;
  configuration: Record<string, string> | null; last_tested_at: string | null;
  last_test_duration_ms: number | null; last_test_mode: string | null;
  validation_steps: ValidationStep[] | null; error_message: string | null; updated_at: string;
}
interface RelevantConnector {
  connectorId: string; connectorName: string; category: string;
  classification: 'required' | 'optional';
  requiredBy: Array<{ capabilityId: string; capabilityName: string }>;
  status: string; lastTestedAt: string | null;
}

/** Adaptive field schema — only providers ConnectorService actually knows provider-specific
 * checks for get a tailored form; everything else gets the generic host/port form, which is
 * still a REAL TCP reachability test, not a simulation. */
const FIELD_SCHEMAS: Record<string, Array<{ key: string; label: string; type?: string; placeholder?: string }>> = {
  postgresql: [
    { key: 'host', label: 'Host', placeholder: 'db.example.com' },
    { key: 'port', label: 'Port', placeholder: '5432' },
    { key: 'database', label: 'Database' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'ssl', label: 'SSL Mode', placeholder: 'require or disable' },
  ],
  sqlserver: [
    { key: 'host', label: 'Host' }, { key: 'port', label: 'Port', placeholder: '1433' },
    { key: 'database', label: 'Database' }, { key: 'username', label: 'Username' }, { key: 'password', label: 'Password', type: 'password' },
  ],
  mongodb: [
    { key: 'host', label: 'Host' }, { key: 'port', label: 'Port', placeholder: '27017' },
    { key: 'database', label: 'Database' }, { key: 'username', label: 'Username' }, { key: 'password', label: 'Password', type: 'password' },
  ],
  aws: [
    { key: 'accountId', label: 'AWS Account ID' }, { key: 'region', label: 'Region', placeholder: 'ap-southeast-2' }, { key: 'roleArn', label: 'IAM Role ARN' },
  ],
  azure: [
    { key: 'tenantId', label: 'Tenant ID' }, { key: 'clientId', label: 'Client (App) ID' },
  ],
  github: [
    { key: 'token', label: 'Personal Access Token', type: 'password' }, { key: 'organization', label: 'Organization (optional)' },
  ],
  'github-actions': [
    { key: 'token', label: 'Personal Access Token', type: 'password' }, { key: 'organization', label: 'Organization (optional)' },
  ],
  kubernetes: [
    { key: 'clusterEndpoint', label: 'Cluster API Endpoint', placeholder: 'https://cluster.example.com:6443' },
  ],
  openshift: [
    { key: 'clusterEndpoint', label: 'Cluster API Endpoint' },
  ],
};

const GENERIC_FIELDS = [
  { key: 'host', label: 'Host / Endpoint', placeholder: 'service.example.com' },
  { key: 'port', label: 'Port', placeholder: '443' },
];

/**
 * One real, named connector instance — collapsed by default. A client can have
 * more than one instance of the same provider (migration 035: "AWS Production"
 * and "AWS Development" are two distinct rows, never forced to share one).
 * `instance` is the real DB row when editing/testing an existing connection;
 * omitted (undefined) when this row is the "+ Add Another" creation workspace,
 * in which case a Connection Name field is shown so the new instance gets a
 * real, human name rather than silently reusing the provider id.
 */
function ConnectorRow({ clientId, providerId, displayName, icon, whyText, instance, onSaved, onRemoved }: {
  clientId: string; providerId: string; displayName: string; icon: string; whyText?: string;
  instance?: RealConnector; onSaved?: () => void; onRemoved?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [instanceName, setInstanceName] = useState(instance?.name && instance.name !== providerId ? instance.name : '');
  const [form, setForm] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [testResult, setTestResult] = useState<{ status: string; steps: ValidationStep[]; error?: string } | null>(null);
  // React-generated, guaranteed-unique per rendered instance — the same connector can legitimately
  // render twice on this page (once in "What We Need", once in the full catalog), so an id derived
  // from providerId alone would collide when both are expanded at once.
  const panelId = useId();

  const fields = FIELD_SCHEMAS[providerId] || GENERIC_FIELDS;
  const isNew = !instance;
  const status = instance?.status;
  const lastTestedAt = instance?.last_tested_at;
  const rowName = instance ? (instance.name && instance.name !== providerId ? instance.name : displayName) : 'New connection';

  async function runTest() {
    setTesting(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/connectors/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, clientId, fields: form, name: instance?.name || instanceName.trim() || undefined }),
      });
      const data = await res.json();
      setTestResult({ status: data.status, steps: data.steps, error: data.error });
    } catch (err) {
      setTestResult({ status: 'failed', steps: [], error: (err as Error).message });
    }
    setTesting(false);
  }

  async function saveConfig() {
    setSaving(true);
    try {
      await fetch(`${API}/api/v1/oc/connectors/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, clientId, fields: form, name: instance?.name || instanceName.trim() || undefined }),
      });
      onSaved ? onSaved() : window.location.reload();
    } catch { /* surfaced via reload */ }
    setSaving(false);
  }

  async function removeInstance() {
    if (!instance) return;
    if (!confirm(`Remove "${rowName}"? This cannot be undone.`)) return;
    setRemoving(true);
    try {
      await fetch(`${API}/api/v1/oc/connectors/${instance.id}?clientId=${encodeURIComponent(clientId)}`, { method: 'DELETE' });
      onRemoved ? onRemoved() : window.location.reload();
    } catch { /* surfaced via reload */ }
    setRemoving(false);
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${isNew ? 'border-dashed border-purple-200' : ''}`}>
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg shrink-0">{icon}</span>
          <div className="min-w-0">
            <span className="text-xs font-medium">{isNew ? `+ Add another ${displayName} connection` : rowName}</span>
            {!isNew && <p className="text-[9px] text-gray-400">{displayName}</p>}
            {whyText && <p className="text-[9px] text-gray-500">{whyText}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {status && <EvidenceBadge status={connectionEvidenceStatus(status)} />}
          {lastTestedAt && <span className="text-[9px] text-gray-400">Last tested: {new Date(lastTestedAt).toLocaleString('en-AU')}</span>}
          {!isNew && (
            <button onClick={removeInstance} disabled={removing} className="text-[10px] font-medium text-red-500 hover:text-red-700 disabled:text-red-200">
              {removing ? 'Removing…' : 'Remove'}
            </button>
          )}
          <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">
            {expanded ? 'Close' : isNew ? 'Add' : 'Configure'}
          </button>
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          {isNew && (
            <div>
              <label htmlFor={`${panelId}-name`} className="block text-[10px] font-medium text-gray-600 mb-0.5">
                Connection Name<span className="text-red-500 ml-0.5" aria-label="required">*</span>
              </label>
              <input
                id={`${panelId}-name`}
                placeholder={`e.g. ${displayName} Production`}
                value={instanceName}
                onChange={e => setInstanceName(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <p className="text-[9px] text-gray-400 mt-0.5">Distinguishes this connection from any other {displayName} connections this client has (e.g. Production vs Development).</p>
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-2">
            {fields.map(f => {
              const fieldId = `${panelId}-${f.key}`;
              const isOptional = /\(optional\)/i.test(f.label);
              return (
                <div key={f.key}>
                  <label htmlFor={fieldId} className="block text-[10px] font-medium text-gray-600 mb-0.5">
                    {f.label.replace(/\s*\(optional\)/i, '')}
                    {!isOptional && <span className="text-red-500 ml-0.5" aria-label="required">*</span>}
                  </label>
                  <input
                    id={fieldId}
                    type={f.type || 'text'}
                    placeholder={f.placeholder}
                    value={form[f.key] || ''}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              );
            })}
          </div>
          {/* Test (exploratory, secondary) then Save (commits config, primary) — same behavior as before, canonical Action styling */}
          <div className="flex gap-2">
            <Action variant="secondary" onClick={runTest} loading={testing} className="!text-[10px] !px-3 !py-1.5">
              {testing ? 'Testing…' : 'Test Connection'}
            </Action>
            <Action variant="primary" onClick={saveConfig} loading={saving} disabled={isNew && !instanceName.trim()} className="!text-[10px] !px-3 !py-1.5 !bg-purple-600 hover:!bg-purple-700 disabled:!bg-gray-300">
              {saving ? 'Saving…' : isNew ? 'Add Connection' : 'Save Configuration'}
            </Action>
          </div>
          {isNew && !instanceName.trim() && <p className="text-[9px] text-amber-600">Connection name is required.</p>}
          {testResult && (
            <div className="bg-white border rounded p-3">
              <EvidenceBadge status={connectionEvidenceStatus(testResult.status)} />
              <div className="space-y-1 mt-2">
                {testResult.steps.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px]">
                    <span className={s.pass ? 'text-gray-700' : 'text-red-600'}>{s.pass ? '✓' : '✕'} {s.step}</span>
                    {s.error && <span className="text-red-500">{s.error}</span>}
                  </div>
                ))}
              </div>
              <EvidenceTrail source="Live connection test" lastTested={new Date()} result={testResult.error || `${testResult.steps.filter(s => s.pass).length}/${testResult.steps.length} steps passed`} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ConnectorGrid({ clientId, connectors, relevantConnectors }: { clientId: string; connectors: RealConnector[]; relevantConnectors: RelevantConnector[] }) {
  // Real multi-instance grouping (migration 035) — a provider can now have zero, one, or
  // many real rows for this client; never collapsed to a single Map entry.
  const byProvider = new Map<string, RealConnector[]>();
  for (const c of connectors) {
    const list = byProvider.get(c.provider) || [];
    list.push(c);
    byProvider.set(c.provider, list);
  }
  const [showAll, setShowAll] = useState(false);

  const connectedCount = connectors.filter(c => c.status === 'connected').length;
  const configuredCount = connectors.filter(c => c.status === 'configured' || c.status === 'partial').length;
  const failedCount = connectors.filter(c => c.status === 'failed').length;
  const totalAvailable = connectorCatalog.reduce((a, c) => a + c.connectors.length, 0);
  const relevantIds = new Set(relevantConnectors.map(r => r.connectorId));

  function findCatalogEntry(providerId: string) {
    for (const cat of connectorCatalog) {
      const found = cat.connectors.find(c => c.id === providerId);
      if (found) return found;
    }
    return null;
  }

  // Real gap found during the 2026-08-21 contract audit: a customer's free-text
  // "Request a Connector / Source" (client-portal) is NOT constrained to this
  // fixed ~33-entry catalog — the customer can type anything ("Snowflake — Finance
  // Reporting Warehouse", "our internal HR system", etc.), and staff approval
  // (client-request-service.ts) creates a REAL oc_connectors row using that
  // free-text as its `provider`. Previously this page only ever rendered rows
  // whose provider matched a catalog id, so any such row was a real, live
  // database record that was permanently unreachable/unmanageable in this UI —
  // staff had no way to see it, configure it, or test it. Every real connector
  // row for this client is now guaranteed a visible home: catalog-matched
  // providers render in their category above as before; anything else renders
  // here instead of silently vanishing.
  const catalogIds = new Set(connectorCatalog.flatMap(cat => cat.connectors.map(c => c.id)));
  const customEntries = Array.from(byProvider.entries()).filter(([providerId]) => !catalogIds.has(providerId));

  return (
    <div>
      {/* Required / relevant for this client's selected services — real, evidence-linked.
          Shows every real configured instance for a relevant provider (not just one), plus
          a blank row to configure the first if none exist yet. Adding further named
          instances beyond what's strictly required happens in the full catalog below. */}
      {relevantConnectors.length > 0 && (
        <section className="bg-white rounded-xl border p-5 mb-6">
          <h3 className="font-semibold text-sm mb-3">What We Need From You</h3>
          <div className="space-y-2">
            {relevantConnectors.map(rc => {
              const catalogEntry = findCatalogEntry(rc.connectorId);
              const why = `${rc.classification === 'required' ? 'Required' : 'Optional'} for: ${rc.requiredBy.map(r => r.capabilityName).join(', ')}`;
              const existing = byProvider.get(rc.connectorId) || [];
              if (existing.length === 0) {
                return (
                  <ConnectorRow key={rc.connectorId} clientId={clientId} providerId={rc.connectorId} displayName={catalogEntry?.name || rc.connectorName} icon={catalogEntry?.icon || '🔌'} whyText={why} />
                );
              }
              return existing.map(inst => (
                <ConnectorRow key={inst.id} clientId={clientId} providerId={rc.connectorId} displayName={catalogEntry?.name || rc.connectorName} icon={catalogEntry?.icon || '🔌'} whyText={why} instance={inst} />
              ));
            })}
          </div>
        </section>
      )}

      {/* Real summary — no fabricated coverage/confidence percentages */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Connected (Verified)" value={connectedCount} color="text-green-600" />
        <Stat label="Configured, Not Verified" value={configuredCount} color="text-yellow-600" />
        <Stat label="Verification Failed" value={failedCount} color="text-red-600" />
        <Stat label="Full Catalog Size" value={totalAvailable} />
      </div>

      <button onClick={() => setShowAll(s => !s)} className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-3 py-1.5 mb-4 transition">
        {showAll ? 'Hide' : 'Show'} all {totalAvailable} connectors (advanced / admin view)
      </button>

      {/* Always visible, not gated behind "Show all" — these came from a real customer
          request or a direct API save, so staff must not have to know to expand an
          "advanced" toggle to discover them. */}
      {customEntries.length > 0 && (
        <section className="bg-white rounded-xl border p-5 mb-4">
          <h3 className="font-semibold text-sm mb-1">Custom / Other Requests</h3>
          <p className="text-[10px] text-gray-500 mb-3">
            Requested by name, not from the standard catalog above — typically a customer-submitted
            &quot;Request a Connector / Source&quot; for something not yet in AskABD&apos;s standard list.
          </p>
          <div className="space-y-2">
            {customEntries.map(([providerId, instances]) => (
              <div key={providerId} className="space-y-1.5">
                {instances.map(inst => (
                  <ConnectorRow key={inst.id} clientId={clientId} providerId={providerId} displayName={inst.name || providerId} icon="🔌" instance={inst} />
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {showAll && (
        <div className="space-y-4">
          {connectorCatalog.map(cat => (
            <section key={cat.category} className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-sm mb-3">{cat.label}</h3>
              <div className="space-y-2">
                {cat.connectors.map(conn => {
                  const instances = byProvider.get(conn.id) || [];
                  const isRelevant = relevantIds.has(conn.id);
                  return (
                    <div key={conn.id} className={`space-y-1.5 ${isRelevant ? 'ring-1 ring-purple-200 rounded-lg p-1.5' : ''}`}>
                      {instances.map(inst => (
                        <ConnectorRow key={inst.id} clientId={clientId} providerId={conn.id} displayName={conn.name} icon={conn.icon} instance={inst} />
                      ))}
                      {/* Always offer to add another named instance — a client is never assumed to
                          have only one AWS account, one GitHub org, one Kubernetes cluster, etc. */}
                      <ConnectorRow clientId={clientId} providerId={conn.id} displayName={conn.name} icon={conn.icon} />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500 uppercase">{label}</p></div>;
}
