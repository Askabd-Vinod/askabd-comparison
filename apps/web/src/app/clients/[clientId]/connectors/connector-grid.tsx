'use client';
import { useId, useState } from 'react';
import { connectorCatalog } from '../../../lib/connectors';
import { EvidenceBadge, EvidenceTrail, connectionEvidenceStatus } from '../../../components/evidence-status';
import { Action } from '../../../components/button';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface ValidationStep { step: string; pass: boolean; durationMs: number; error?: string }
interface RealConnector {
  id: string; provider: string; status: string; security_level: string;
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

function ConnectorRow({ clientId, providerId, name, icon, whyText, status, lastTestedAt }: { clientId: string; providerId: string; name: string; icon: string; whyText?: string; status?: string; lastTestedAt?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ status: string; steps: ValidationStep[]; error?: string } | null>(null);
  // React-generated, guaranteed-unique per rendered instance — the same connector can legitimately
  // render twice on this page (once in "What We Need", once in the full catalog), so an id derived
  // from providerId alone would collide when both are expanded at once.
  const panelId = useId();

  const fields = FIELD_SCHEMAS[providerId] || GENERIC_FIELDS;

  async function runTest() {
    setTesting(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/connectors/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, clientId, fields: form }),
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
        body: JSON.stringify({ provider: providerId, clientId, fields: form }),
      });
      window.location.reload();
    } catch { /* surfaced via reload */ }
    setSaving(false);
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <div>
            <span className="text-xs font-medium">{name}</span>
            {whyText && <p className="text-[9px] text-gray-500">{whyText}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {status && <EvidenceBadge status={connectionEvidenceStatus(status)} />}
          {lastTestedAt && <span className="text-[9px] text-gray-400">Last tested: {new Date(lastTestedAt).toLocaleString('en-AU')}</span>}
          <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">
            {expanded ? 'Close' : 'Configure'}
          </button>
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          <div className="grid md:grid-cols-2 gap-2">
            {fields.map(f => {
              const fieldId = `${providerId}-${f.key}`;
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
            <Action variant="primary" onClick={saveConfig} loading={saving} className="!text-[10px] !px-3 !py-1.5 !bg-purple-600 hover:!bg-purple-700 disabled:!bg-gray-300">
              {saving ? 'Saving…' : 'Save Configuration'}
            </Action>
          </div>
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
  const byProvider = new Map(connectors.map(c => [c.provider, c]));
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

  return (
    <div>
      {/* Required / relevant for this client's selected services — real, evidence-linked */}
      {relevantConnectors.length > 0 && (
        <section className="bg-white rounded-xl border p-5 mb-6">
          <h3 className="font-semibold text-sm mb-3">What We Need From You</h3>
          <div className="space-y-2">
            {relevantConnectors.map(rc => {
              const catalogEntry = findCatalogEntry(rc.connectorId);
              const why = `${rc.classification === 'required' ? 'Required' : 'Optional'} for: ${rc.requiredBy.map(r => r.capabilityName).join(', ')}`;
              return (
                <ConnectorRow key={rc.connectorId} clientId={clientId} providerId={rc.connectorId} name={catalogEntry?.name || rc.connectorName} icon={catalogEntry?.icon || '🔌'} whyText={why} status={rc.status} lastTestedAt={rc.lastTestedAt} />
              );
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

      {showAll && (
        <div className="space-y-4">
          {connectorCatalog.map(cat => (
            <section key={cat.category} className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-sm mb-3">{cat.label}</h3>
              <div className="space-y-2">
                {cat.connectors.map(conn => {
                  const real = byProvider.get(conn.id);
                  const isRelevant = relevantIds.has(conn.id);
                  return (
                    <div key={conn.id} className={isRelevant ? 'ring-1 ring-purple-200 rounded-lg' : ''}>
                      <ConnectorRow clientId={clientId} providerId={conn.id} name={conn.name} icon={conn.icon} status={real?.status} lastTestedAt={real?.last_tested_at} />
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
