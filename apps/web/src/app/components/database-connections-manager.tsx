'use client';
import { useState, useEffect, useCallback, useId } from 'react';
import { Action } from './button';
import { ConnectionSecurityPanel } from './connection-security-panel';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export interface DatabaseConnection {
  id: string; clientId: string; name: string; connectorType: string;
  host: string; port: number; databaseName: string; username: string; hasPassword: boolean;
  authType: string; environment: string; description: string; tags: string[];
  status: 'not_tested' | 'connected' | 'failed' | 'disabled';
  lastTestMode: string | null; lastTestSteps: Array<{ step: string; pass: boolean; durationMs: number; error?: string }>;
  lastTestError: string; lastTestedAt: string | null; createdAt: string;
  sslMode: 'disable' | 'require' | 'verify-full'; hasSslCaCertificate: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  postgresql: 'PostgreSQL', oracle: 'Oracle', sqlserver: 'SQL Server', mysql: 'MySQL', mongodb: 'MongoDB', other: 'Other',
};
const STATUS_META: Record<string, { label: string; className: string; dot: string }> = {
  connected: { label: 'Connected', className: 'text-green-700 bg-green-50 border-green-200', dot: 'bg-green-500' },
  not_tested: { label: 'Not Tested', className: 'text-gray-500 bg-gray-50 border-gray-200', dot: 'bg-gray-400' },
  failed: { label: 'Connection Failed', className: 'text-red-700 bg-red-50 border-red-200', dot: 'bg-red-500' },
  disabled: { label: 'Disabled', className: 'text-gray-400 bg-gray-50 border-gray-200', dot: 'bg-gray-300' },
};
const ENV_OPTIONS = ['production', 'staging', 'uat', 'development'];
const AUTH_OPTIONS = ['standard', 'iam', 'kerberos', 'certificate'];
const SSL_MODE_OPTIONS: Array<{ value: 'disable' | 'require' | 'verify-full'; label: string; hint: string }> = [
  { value: 'disable', label: 'Disable', hint: 'No TLS. Only use on a network you already trust (e.g. a VPN-only path).' },
  { value: 'require', label: 'Require', hint: 'Encrypts the connection, but does not verify the server’s certificate.' },
  { value: 'verify-full', label: 'Verify Full (recommended)', hint: 'Encrypts AND verifies the server’s certificate + hostname — provide a CA certificate below if the server uses one AskABD doesn’t already trust.' },
];

interface FormState {
  name: string; connectorType: string; host: string; port: string; databaseName: string;
  username: string; password: string; authType: string; environment: string; description: string; tagsInput: string;
  sslMode: 'disable' | 'require' | 'verify-full'; sslCaCertificate: string;
}
const EMPTY_FORM: FormState = { name: '', connectorType: 'postgresql', host: '', port: '5432', databaseName: '', username: '', password: '', authType: 'standard', environment: 'production', description: '', tagsInput: '', sslMode: 'require', sslCaCertificate: '' };

const DEFAULT_PORTS: Record<string, string> = { postgresql: '5432', oracle: '1521', sqlserver: '1433', mysql: '3306', mongodb: '27017', other: '' };

function validate(form: FormState): string | null {
  if (!form.name.trim()) return 'Connection name is required.';
  if (!form.host.trim()) return 'Host or IP address is required.';
  const port = parseInt(form.port, 10);
  if (!form.port.trim() || !Number.isInteger(port) || port < 1 || port > 65535) return 'Port must be a valid port number.';
  if (!form.databaseName.trim()) return 'Database/service is required.';
  if (!form.username.trim()) return 'Username is required.';
  if (!form.password.trim()) return 'Password is required.';
  if (!form.environment) return 'Environment is required.';
  return null;
}

function ConnectionCard({ conn, onTest, onRemove, onSaved, testingId }: {
  conn: DatabaseConnection; onTest: (id: string) => void; onRemove: (id: string) => void; onSaved: () => void; testingId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: conn.name, connectorType: conn.connectorType, host: conn.host, port: String(conn.port), databaseName: conn.databaseName,
    username: conn.username, password: '', authType: conn.authType, environment: conn.environment, description: conn.description, tagsInput: conn.tags.join(', '),
    sslMode: conn.sslMode, sslCaCertificate: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const panelId = useId();
  const meta = STATUS_META[conn.status] || STATUS_META.not_tested;

  async function saveEdit() {
    setError(null);
    const err = validate({ ...form, password: form.password || 'unchanged-placeholder' });
    if (err && !(err === 'Password is required.' && !form.password)) { setError(err); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(), connectorType: form.connectorType, host: form.host.trim(), port: parseInt(form.port, 10),
        databaseName: form.databaseName.trim(), username: form.username.trim(), authType: form.authType,
        environment: form.environment, description: form.description.trim(),
        tags: form.tagsInput.split(',').map(t => t.trim()).filter(Boolean),
        sslMode: form.sslMode,
      };
      if (form.password) body.password = form.password;
      // Leave unchanged unless the field was actually edited — an empty
      // textarea should not silently wipe out a previously-saved CA cert.
      if (form.sslCaCertificate) body.sslCaCertificate = form.sslCaCertificate;
      body.clientId = conn.clientId;
      const res = await fetch(`${API}/api/v1/oc/database-connections/${conn.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json().catch(() => null); setError(d?.error?.message || 'Could not save changes.'); return; }
      setEditing(false);
      onSaved();
    } catch { setError('Could not reach AskABD. Please try again.'); }
    finally { setSaving(false); }
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${conn.status === 'connected' ? 'border-green-200' : ''}`}>
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-900">{conn.name}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">{TYPE_LABEL[conn.connectorType] || conn.connectorType} • {conn.host} • <span className="capitalize">{conn.environment}</span></p>
          {conn.lastTestedAt && <p className="text-[9px] text-gray-400 mt-0.5">Last tested: {new Date(conn.lastTestedAt).toLocaleString('en-AU')}</p>}
        </div>
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${meta.className}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{meta.label}
          </span>
          <button onClick={() => onTest(conn.id)} disabled={testingId === conn.id} className="text-[10px] font-medium text-purple-600 hover:text-purple-800 disabled:text-purple-300">
            {testingId === conn.id ? 'Testing…' : 'Test'}
          </button>
          <button onClick={() => { setEditing(e => !e); setExpanded(true); }} className="text-[10px] font-medium text-gray-600 hover:text-gray-900">Edit</button>
          <button onClick={() => onRemove(conn.id)} className="text-[10px] font-medium text-red-600 hover:text-red-800">Remove</button>
          <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-gray-400 hover:text-gray-700">
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 text-xs">
          {!editing ? (
            <>
              <dl className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div><dt className="text-[9px] text-gray-400 uppercase">Connection Type</dt><dd className="text-gray-700 font-medium mt-0.5">{TYPE_LABEL[conn.connectorType] || conn.connectorType}</dd></div>
                <div><dt className="text-[9px] text-gray-400 uppercase">Host</dt><dd className="text-gray-700 font-medium mt-0.5">{conn.host}</dd></div>
                <div><dt className="text-[9px] text-gray-400 uppercase">Port</dt><dd className="text-gray-700 font-medium mt-0.5">{conn.port}</dd></div>
                <div><dt className="text-[9px] text-gray-400 uppercase">Database / Service</dt><dd className="text-gray-700 font-medium mt-0.5">{conn.databaseName}</dd></div>
                <div><dt className="text-[9px] text-gray-400 uppercase">Environment</dt><dd className="text-gray-700 font-medium mt-0.5 capitalize">{conn.environment}</dd></div>
                <div><dt className="text-[9px] text-gray-400 uppercase">Authentication Type</dt><dd className="text-gray-700 font-medium mt-0.5 capitalize">{conn.authType}</dd></div>
                <div><dt className="text-[9px] text-gray-400 uppercase">Username</dt><dd className="text-gray-700 font-medium mt-0.5">{conn.username}</dd></div>
                <div><dt className="text-[9px] text-gray-400 uppercase">Password</dt><dd className="text-gray-400 font-medium mt-0.5">{conn.hasPassword ? '•••••••• (stored securely)' : 'Not set'}</dd></div>
                <div>
                  <dt className="text-[9px] text-gray-400 uppercase">TLS / Encryption</dt>
                  <dd className="font-medium mt-0.5">
                    {conn.sslMode === 'disable' ? (
                      <span className="text-amber-600">Disabled — not encrypted</span>
                    ) : (() => {
                      const tlsStep = conn.lastTestSteps.find(s => s.step.startsWith('TLS Negotiated'));
                      if (!tlsStep) return <span className="text-gray-500">{conn.sslMode === 'verify-full' ? 'Verify Full' : 'Require'} — not yet tested</span>;
                      return tlsStep.pass
                        ? <span className="text-green-700">🔒 {tlsStep.step.replace('TLS Negotiated ', '')}</span>
                        : <span className="text-red-600">Requested but not confirmed — see Last Test Result</span>;
                    })()}
                  </dd>
                </div>
              </dl>
              {conn.description && <div className="mt-3"><p className="text-[9px] text-gray-400 uppercase">Description</p><p className="text-gray-700 mt-0.5">{conn.description}</p></div>}
              {conn.tags.length > 0 && (
                <div className="mt-3 flex gap-1 flex-wrap">{conn.tags.map(t => <span key={t} className="text-[10px] px-2 py-0.5 bg-white border rounded text-gray-600">{t}</span>)}</div>
              )}
              {conn.lastTestSteps.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-[9px] text-gray-400 uppercase mb-1.5">Last Test Result</p>
                  <div className="space-y-1">
                    {conn.lastTestSteps.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px]">
                        <span className={s.pass ? 'text-gray-700' : 'text-red-600'}>{s.pass ? '✓' : '✕'} {s.step}</span>
                        {s.error && <span className="text-red-500 max-w-[60%] text-right">{s.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <ConnectionSecurityPanel clientId={conn.clientId} sourceType="oc_client_database_connections" sourceId={conn.id} />
            </>
          ) : (
            <div className="space-y-2.5">
              <div className="grid sm:grid-cols-2 gap-2.5">
                <Field label="Connection Type" required>
                  <select value={form.connectorType} onChange={e => setForm(f => ({ ...f, connectorType: e.target.value }))} className={FIELD_CLASS}>
                    {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Connection Name" required>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={FIELD_CLASS} />
                </Field>
                <Field label="Host / IP Address" required>
                  <input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} className={FIELD_CLASS} />
                </Field>
                <Field label="Port" required>
                  <input value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} className={FIELD_CLASS} />
                </Field>
                <Field label="Database / Service" required>
                  <input value={form.databaseName} onChange={e => setForm(f => ({ ...f, databaseName: e.target.value }))} className={FIELD_CLASS} />
                </Field>
                <Field label="Environment" required>
                  <select value={form.environment} onChange={e => setForm(f => ({ ...f, environment: e.target.value }))} className={FIELD_CLASS}>
                    {ENV_OPTIONS.map(o => <option key={o} value={o} className="capitalize">{o}</option>)}
                  </select>
                </Field>
                <Field label="Username" required>
                  <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className={FIELD_CLASS} />
                </Field>
                <Field label="Authentication Type">
                  <select value={form.authType} onChange={e => setForm(f => ({ ...f, authType: e.target.value }))} className={FIELD_CLASS}>
                    {AUTH_OPTIONS.map(o => <option key={o} value={o} className="capitalize">{o}</option>)}
                  </select>
                </Field>
                <Field label="Password" hint="Leave unchanged to keep the existing password">
                  <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Leave unchanged" className={FIELD_CLASS} />
                </Field>
                <Field label="Description">
                  <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" className={FIELD_CLASS} />
                </Field>
              </div>
              <Field label="Tags">
                <input value={form.tagsInput} onChange={e => setForm(f => ({ ...f, tagsInput: e.target.value }))} placeholder="comma, separated, tags" className={FIELD_CLASS} />
              </Field>
              <Field label="TLS / Encryption" hint={SSL_MODE_OPTIONS.find(o => o.value === form.sslMode)?.hint}>
                <select value={form.sslMode} onChange={e => setForm(f => ({ ...f, sslMode: e.target.value as FormState['sslMode'] }))} className={FIELD_CLASS}>
                  {SSL_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              {form.sslMode === 'verify-full' && (
                <Field label="CA Certificate" hint={conn.hasSslCaCertificate ? 'A CA certificate is already saved. Leave blank to keep it unchanged.' : 'Required if the server uses a certificate AskABD doesn’t already trust (e.g. a self-signed or internal CA cert). Paste the real PEM-encoded certificate.'}>
                  <textarea value={form.sslCaCertificate} onChange={e => setForm(f => ({ ...f, sslCaCertificate: e.target.value }))} placeholder={'-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'} rows={4} className={`${FIELD_CLASS} font-mono text-[10px]`} />
                </Field>
              )}
              {error && <p className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</p>}
              <div className="flex gap-2">
                <Action variant="secondary" onClick={() => { setEditing(false); setError(null); }} className="!text-[10px] !px-3 !py-1.5">Cancel</Action>
                <Action variant="primary" onClick={saveEdit} loading={saving} className="!text-[10px] !px-3 !py-1.5">Save Changes</Action>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const FIELD_CLASS = 'w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 mt-0.5';

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-600">
        {label}{required && <span className="text-red-500 ml-0.5" aria-label="required">*</span>}
      </label>
      {children}
      {hint && <p className="text-[9px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export function DatabaseConnectionsManager({ clientId, onReadinessChange }: { clientId: string; onReadinessChange?: (hasConnected: boolean) => void }) {
  const [connections, setConnections] = useState<DatabaseConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/database-connections`);
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
        onReadinessChange?.((data.connections || []).some((c: DatabaseConnection) => c.status === 'connected'));
      }
    } catch { /* non-blocking */ }
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  async function createConnection() {
    setError(null);
    const err = validate(form);
    if (err) { setError(err); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/database-connections`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(), connectorType: form.connectorType, host: form.host.trim(), port: parseInt(form.port, 10),
          databaseName: form.databaseName.trim(), username: form.username.trim(), password: form.password,
          authType: form.authType, environment: form.environment, description: form.description.trim(),
          tags: form.tagsInput.split(',').map(t => t.trim()).filter(Boolean),
          sslMode: form.sslMode, sslCaCertificate: form.sslCaCertificate || undefined,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => null); setError(d?.error?.message || 'Could not add this connection.'); return; }
      setForm(EMPTY_FORM);
      setShowAddForm(false);
      await load();
    } catch { setError('Could not reach AskABD. Please try again.'); }
    finally { setSaving(false); }
  }

  async function testConnection(id: string) {
    setTestingId(id);
    try {
      const res = await fetch(`${API}/api/v1/oc/database-connections/${id}/test?clientId=${encodeURIComponent(clientId)}`, { method: 'POST' });
      if (res.ok) await load();
    } finally { setTestingId(null); }
  }

  async function removeConnection(id: string) {
    if (!confirm('Remove this database connection? This cannot be undone.')) return;
    try {
      await fetch(`${API}/api/v1/oc/database-connections/${id}?clientId=${encodeURIComponent(clientId)}`, { method: 'DELETE' });
      await load();
    } catch { /* surfaced via list not updating */ }
  }

  if (loading) return <p className="text-xs text-gray-400 text-center py-4">Loading connections…</p>;

  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-700">Database Connections ({connections.length})</h3>
        {connections.length > 0 && (
          <Action variant="primary" onClick={() => { setShowAddForm(v => !v); setError(null); }} className="!text-[10px] !px-3 !py-1.5">
            {showAddForm ? 'Cancel' : '+ Add Connection'}
          </Action>
        )}
      </div>

      {showAddForm && (
        <div className="border rounded-lg overflow-hidden mb-3 border-purple-200">
          <div className="bg-purple-50 px-3 py-2 border-b border-purple-100">
            <p className="text-xs font-semibold text-purple-800">+ New Database Connection</p>
          </div>
          <div className="p-4 space-y-2.5">
            <div className="grid sm:grid-cols-2 gap-2.5">
              <Field label="Connection Type" required>
                <select value={form.connectorType} onChange={e => setForm(f => ({ ...f, connectorType: e.target.value, port: DEFAULT_PORTS[e.target.value] || f.port }))} className={FIELD_CLASS}>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Connection Name" required>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Production Oracle DB" className={FIELD_CLASS} />
              </Field>
              <Field label="Host / IP Address" required>
                <input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} placeholder="db-prod.company.com" className={FIELD_CLASS} />
              </Field>
              <Field label="Port" required>
                <input value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} className={FIELD_CLASS} />
              </Field>
              <Field label="Database / Service" required>
                <input value={form.databaseName} onChange={e => setForm(f => ({ ...f, databaseName: e.target.value }))} className={FIELD_CLASS} />
              </Field>
              <Field label="Environment" required>
                <select value={form.environment} onChange={e => setForm(f => ({ ...f, environment: e.target.value }))} className={FIELD_CLASS}>
                  {ENV_OPTIONS.map(o => <option key={o} value={o} className="capitalize">{o}</option>)}
                </select>
              </Field>
              <Field label="Username" required>
                <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="askabd_user" className={FIELD_CLASS} />
              </Field>
              <Field label="Authentication Type">
                <select value={form.authType} onChange={e => setForm(f => ({ ...f, authType: e.target.value }))} className={FIELD_CLASS}>
                  {AUTH_OPTIONS.map(o => <option key={o} value={o} className="capitalize">{o}</option>)}
                </select>
              </Field>
              <Field label="Password" required>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••••••" className={FIELD_CLASS} />
              </Field>
              <Field label="Description">
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" className={FIELD_CLASS} />
              </Field>
            </div>
            <Field label="Tags">
              <input value={form.tagsInput} onChange={e => setForm(f => ({ ...f, tagsInput: e.target.value }))} placeholder="production, oracle" className={FIELD_CLASS} />
            </Field>
            <Field label="TLS / Encryption" hint={SSL_MODE_OPTIONS.find(o => o.value === form.sslMode)?.hint}>
              <select value={form.sslMode} onChange={e => setForm(f => ({ ...f, sslMode: e.target.value as FormState['sslMode'] }))} className={FIELD_CLASS}>
                {SSL_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            {form.sslMode === 'verify-full' && (
              <Field label="CA Certificate" hint="Required if the server uses a certificate AskABD doesn’t already trust (e.g. a self-signed or internal CA cert). Paste the real PEM-encoded certificate.">
                <textarea value={form.sslCaCertificate} onChange={e => setForm(f => ({ ...f, sslCaCertificate: e.target.value }))} placeholder={'-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'} rows={4} className={`${FIELD_CLASS} font-mono text-[10px]`} />
              </Field>
            )}
            {error && <p className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</p>}
            <div className="flex items-center justify-between pt-1">
              <p className="text-[9px] text-gray-400">All fields marked * are required.</p>
              <div className="flex gap-2">
                <Action variant="secondary" onClick={() => { setShowAddForm(false); setForm(EMPTY_FORM); setError(null); }} className="!text-[10px] !px-3 !py-1.5">Cancel</Action>
                <Action variant="primary" onClick={createConnection} loading={saving} className="!text-[10px] !px-3 !py-1.5">Add Connection</Action>
              </div>
            </div>
          </div>
        </div>
      )}

      {connections.length === 0 && !showAddForm ? (
        <div className="text-center py-8">
          <p className="text-xs font-medium text-gray-700">No connections configured yet</p>
          <p className="text-[10px] text-gray-400 mt-1 mb-3">Add a connection to continue discovery and assessment.</p>
          <Action variant="primary" onClick={() => setShowAddForm(true)} className="!text-[10px] !px-3.5 !py-2">+ Add First Connection</Action>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map(conn => (
            <ConnectionCard key={conn.id} conn={conn} onTest={testConnection} onRemove={removeConnection} onSaved={load} testingId={testingId} />
          ))}
        </div>
      )}
    </div>
  );
}
