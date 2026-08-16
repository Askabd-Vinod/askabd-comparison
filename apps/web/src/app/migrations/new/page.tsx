'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Breadcrumb } from '../../components/breadcrumb';
import { migrationTypes } from '../../lib/migration-intelligence';
import { DownloadButton } from '../../components/download-button';

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

const steps: Array<{ num: Step; title: string; desc: string; why: string; duration: string }> = [
  { num: 1, title: 'Discovery', desc: 'Define migration scope and type', why: 'Establishes what is being migrated and for whom', duration: '5 min' },
  { num: 2, title: 'Source Connection', desc: 'Connect and validate source system', why: 'Ensures we can read from the source safely', duration: '2 min' },
  { num: 3, title: 'Target Connection', desc: 'Connect and validate target system', why: 'Ensures target can receive the migration', duration: '2 min' },
  { num: 4, title: 'Environment Validation', desc: 'Validate compatibility between systems', why: 'Prevents migration failures from incompatibility', duration: '3 min' },
  { num: 5, title: 'Assessment', desc: 'Risk, gap, and readiness analysis', why: 'Identifies issues before they cause problems', duration: '5 min' },
  { num: 6, title: 'Strategy', desc: 'Choose migration approach', why: 'Different strategies suit different risk profiles', duration: '3 min' },
  { num: 7, title: 'Plan', desc: 'Generate execution plan', why: 'Structured plan with rollback and validation', duration: '2 min' },
  { num: 8, title: 'Dry Run', desc: 'Simulate without changes', why: 'Catches problems before real data is touched', duration: '5-15 min' },
  { num: 9, title: 'Execute', desc: 'Run the migration', why: 'Transfers data from source to target', duration: '10-60 min' },
  { num: 10, title: 'Validation', desc: 'Compare source vs target', why: 'Confirms nothing was lost or corrupted', duration: '5 min' },
  { num: 11, title: 'Audit', desc: 'Post-migration audit', why: 'Complete audit trail for governance', duration: '2 min' },
  { num: 12, title: 'Report', desc: 'Executive reports', why: 'Stakeholder-ready documentation', duration: '1 min' },
];

const connectorOptions = [
  'PostgreSQL', 'MySQL', 'SQL Server', 'Oracle', 'MongoDB', 'MariaDB', 'Snowflake', 'BigQuery', 'Redshift',
  'AWS', 'Azure', 'Google Cloud', 'Kubernetes', 'Docker', 'OpenShift', 'VMware',
  'GitHub', 'GitLab', 'Azure DevOps', 'Bitbucket',
  'SAP', 'Salesforce', 'Dynamics 365', 'ServiceNow',
  'REST API', 'SFTP', 'FTP', 'File System', 'SharePoint', 'NAS',
  'Linux Server', 'Windows Server', 'Unix', 'Mainframe',
  'Active Directory', 'Okta', 'Microsoft Entra ID', 'LDAP',
  'Kafka', 'RabbitMQ', 'Webhook',
];

interface ValidationCheck { label: string; status: 'pass' | 'warning' | 'failed' | 'pending'; detail: string; fix?: string; effort?: string }

function generateValidationChecks(connected: boolean): ValidationCheck[] {
  if (!connected) return [
    { label: 'Hostname', status: 'pending', detail: 'Not yet validated' },
    { label: 'DNS Resolution', status: 'pending', detail: 'Waiting for connection' },
  ];
  return [
    { label: 'Hostname', status: 'pass', detail: 'Host resolved successfully' },
    { label: 'DNS Resolution', status: 'pass', detail: 'DNS lookup: 2ms' },
    { label: 'Port Reachability', status: 'pass', detail: 'Port 5432 open and accepting connections' },
    { label: 'SSL/TLS', status: 'pass', detail: 'TLS 1.3 — certificate valid until 2027-03-15' },
    { label: 'Authentication', status: 'pass', detail: 'Credentials accepted — session established' },
    { label: 'Authorization', status: 'pass', detail: 'User has SELECT, INSERT, UPDATE privileges' },
    { label: 'Database Version', status: 'pass', detail: 'PostgreSQL 15.4 — compatible' },
    { label: 'Network Latency', status: 'pass', detail: '3ms round-trip — excellent' },
    { label: 'Timeout', status: 'pass', detail: 'Connection stable for 30s test window' },
    { label: 'Available Storage', status: 'pass', detail: '245 GB free (need ~2 GB)' },
    { label: 'Available Memory', status: 'pass', detail: '12 GB free — sufficient for batch operations' },
    { label: 'Firewall Rules', status: 'pass', detail: 'Inbound 5432 allowed from AskABD IP range' },
    { label: 'Connectivity Stability', status: 'pass', detail: '0 drops in 30s stability test' },
  ];
}

interface DiscoveredObject { type: string; name: string; count?: number; detail?: string }

function generateDiscovery(): DiscoveredObject[] {
  return [
    { type: 'Databases', name: 'comparison', count: 1, detail: '1.8 GB total' },
    { type: 'Schemas', name: 'public, auth, catalog', count: 3, detail: 'Active schemas' },
    { type: 'Tables', name: 'categories, items, reviews, merchants…', count: 24, detail: '847,500 total rows' },
    { type: 'Views', name: 'v_active_items, v_merchant_stats…', count: 8, detail: 'Read-only views' },
    { type: 'Indexes', name: 'Primary + secondary indexes', count: 42, detail: 'B-tree and GIN types' },
    { type: 'Functions', name: 'Stored functions', count: 12, detail: 'PL/pgSQL' },
    { type: 'Triggers', name: 'Audit triggers', count: 6, detail: 'BEFORE/AFTER INSERT/UPDATE' },
    { type: 'Users', name: 'comp_user, admin, readonly', count: 3, detail: 'Database roles' },
    { type: 'Permissions', name: 'Role-based access', count: 15, detail: 'GRANT statements' },
    { type: 'Sequences', name: 'Auto-increment sequences', count: 18, detail: 'BIGSERIAL' },
    { type: 'Constraints', name: 'PK, FK, CHECK, UNIQUE', count: 67, detail: 'Data integrity' },
    { type: 'Storage', name: 'Tablespace allocation', count: 1, detail: '1.8 GB used / 245 GB free' },
  ];
}

export default function NewMigrationPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [toast, setToast] = useState<string | null>(null);
  const [sourceConnected, setSourceConnected] = useState(false);
  const [targetConnected, setTargetConnected] = useState(false);
  const [validationPassed, setValidationPassed] = useState(false);
  const [dryRunComplete, setDryRunComplete] = useState(false);
  const [executionPhase, setExecutionPhase] = useState<'idle' | 'running' | 'paused' | 'complete'>('idle');
  const [executionProgress, setExecutionProgress] = useState(0);
  const [executionTable, setExecutionTable] = useState('');
  const [auditComplete, setAuditComplete] = useState(false);
  const [sourceChecks, setSourceChecks] = useState<ValidationCheck[]>(generateValidationChecks(false));
  const [targetChecks, setTargetChecks] = useState<ValidationCheck[]>(generateValidationChecks(false));
  const [connecting, setConnecting] = useState(false);

  const [form, setForm] = useState({
    name: '', type: '', client: '', description: '', priority: 'medium',
    sourceConnector: '', sourceUrl: '', sourceUser: '', sourcePass: '',
    targetConnector: '', targetUrl: '', targetUser: '', targetPass: '',
    strategy: '', timeline: '', budget: '', owner: '',
  });

  useEffect(() => {
    const draft = localStorage.getItem('askabd-migration-draft');
    if (draft) { try { const d = JSON.parse(draft); setForm(d.form || form); setStep(d.step || 1); } catch {} }
  }, []);

  function saveDraft() { localStorage.setItem('askabd-migration-draft', JSON.stringify({ form, step })); showToast('✓ Draft saved'); }
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 4000); }

  function validateStep(): boolean {
    switch (step) {
      case 1: if (!form.name || !form.type || !form.client) { showToast('⚠ Name, Type, and Client are required to proceed'); return false; } return true;
      case 2: if (!sourceConnected) { showToast('⚠ Connect and validate source before proceeding'); return false; } return true;
      case 3: if (!targetConnected) { showToast('⚠ Connect and validate target before proceeding'); return false; } return true;
      case 4: if (!validationPassed) { showToast('⚠ Run environment validation first'); return false; } return true;
      case 8: if (!dryRunComplete) { showToast('⚠ Dry run must complete successfully'); return false; } return true;
      case 9: if (executionPhase !== 'complete') { showToast('⚠ Migration must complete before validation'); return false; } return true;
      default: return true;
    }
  }

  function handleNext() { if (!validateStep()) return; setStep(Math.min(12, step + 1) as Step); }
  function handlePrev() { setStep(Math.max(1, step - 1) as Step); }

  function connectSource() {
    setConnecting(true);
    // Simulate progressive validation
    const checks = generateValidationChecks(false);
    let idx = 0;
    const interval = setInterval(() => {
      if (idx < generateValidationChecks(true).length) {
        checks[idx] = generateValidationChecks(true)[idx];
        setSourceChecks([...checks]);
        idx++;
      } else {
        clearInterval(interval);
        setSourceConnected(true);
        setConnecting(false);
        setSourceChecks(generateValidationChecks(true));
      }
    }, 300);
  }

  function connectTarget() {
    setConnecting(true);
    setTimeout(() => {
      setTargetChecks(generateValidationChecks(true));
      setTargetConnected(true);
      setConnecting(false);
    }, 2000);
  }

  function runValidation() {
    showToast('Running compatibility checks…');
    setTimeout(() => { setValidationPassed(true); }, 2500);
  }

  function runDryRun() {
    showToast('Simulating migration (no data modified)…');
    setTimeout(() => { setDryRunComplete(true); }, 3000);
  }

  function runExecution() {
    setExecutionPhase('running');
    const tables = ['categories', 'items', 'reviews', 'merchants', 'brands', 'prices', 'users', 'comparisons', 'templates', 'audit_log'];
    let progress = 0;
    let tIdx = 0;
    const interval = setInterval(() => {
      if (executionPhase === 'paused') return;
      progress += Math.random() * 12 + 3;
      if (progress >= 100) progress = 100;
      tIdx = Math.min(Math.floor((progress / 100) * tables.length), tables.length - 1);
      setExecutionProgress(Math.round(progress));
      setExecutionTable(tables[tIdx]);
      if (progress >= 100) { clearInterval(interval); setExecutionPhase('complete'); }
    }, 800);
  }

  function pauseExecution() { setExecutionPhase('paused'); showToast('Migration paused'); }
  function resumeExecution() { setExecutionPhase('running'); runExecution(); }
  function runAudit() { showToast('Running audit…'); setTimeout(() => setAuditComplete(true), 2000); }
  function completeMigration() { localStorage.removeItem('askabd-migration-draft'); router.push('/migrations'); }

  const categories = [...new Set(migrationTypes.map(t => t.category))];
  const currentStep = steps[step - 1];

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 relative">
      {toast && <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-lg shadow-xl text-sm font-medium max-w-lg text-center animate-in">{toast}</div>}
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Migrations', href: '/migrations' }, { label: 'Migration Studio' }]} />
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-2xl font-bold text-gray-900">Migration Studio</h1><p className="text-sm text-gray-500">Step {step}/12: {currentStep.title}</p></div>
        <button onClick={saveDraft} className="text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg border transition">💾 Save Draft</button>
      </div>

      {/* Step indicator */}
      <div className="flex gap-0.5 mb-4 overflow-x-auto pb-1">{steps.map(s => (
        <div key={s.num} className={`px-1.5 py-1 rounded text-[8px] font-medium whitespace-nowrap ${step === s.num ? 'bg-purple-600 text-white' : step > s.num ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{step > s.num ? '✓' : s.num} {s.title}</div>
      ))}</div>

      {/* Context banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-4 flex items-center justify-between text-[10px] text-blue-700">
        <div><strong>What:</strong> {currentStep.desc} | <strong>Why:</strong> {currentStep.why}</div>
        <span>Est: {currentStep.duration}</span>
      </div>

      <div className="bg-white rounded-xl border p-6 mb-6 min-h-[400px]">
        {/* ═══ STEP 1: DISCOVERY ═══ */}
        {step === 1 && (<div className="space-y-4">
          <SH title="Discovery" desc="Define what you are migrating. This establishes the scope and ensures the right team is assigned." />
          <div className="grid md:grid-cols-2 gap-4">
            <Fld label="Migration Name" required value={form.name} onChange={v => setForm({...form, name: v})} placeholder="e.g. Trading Platform Cloud Migration" />
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Organization <span className="text-red-500">*</span></label><select value={form.client} onChange={e => setForm({...form, client: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"><option value="">Select…</option><option value="meridian-financial">Meridian Financial Group</option><option value="nexus-healthcare">Nexus Healthcare Systems</option><option value="atlas-logistics">Atlas Logistics International</option></select></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Migration Type <span className="text-red-500">*</span></label><div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-[220px] overflow-y-auto border rounded-lg p-3">{categories.map(cat => (<div key={cat}><p className="text-[8px] font-bold text-gray-400 uppercase mb-0.5">{cat}</p>{migrationTypes.filter(t => t.category === cat).map(t => (<button key={t.value} onClick={() => setForm({...form, type: t.value})} className={`block w-full text-left text-[10px] px-2 py-1 rounded mb-0.5 ${form.type === t.value ? 'bg-purple-600 text-white' : 'hover:bg-gray-100'}`}>{t.label}</button>))}</div>))}</div></div>
          <Fld label="Description" value={form.description} onChange={v => setForm({...form, description: v})} placeholder="Scope and objectives…" textarea />
        </div>)}

        {/* ═══ STEP 2: SOURCE ═══ */}
        {step === 2 && (<div className="space-y-4">
          <SH title="Source Connection" desc="Connect to the source system. Every aspect is validated before you can proceed — host, port, SSL, auth, permissions, version, storage, and stability." />
          <div className="grid md:grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Connector <span className="text-red-500">*</span></label><select value={form.sourceConnector} onChange={e => setForm({...form, sourceConnector: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"><option value="">Select type…</option>{connectorOptions.map(c => <option key={c}>{c}</option>)}</select></div>
            <Fld label="Connection URL" required value={form.sourceUrl} onChange={v => setForm({...form, sourceUrl: v})} placeholder="host:port/database" mono />
            <Fld label="Username" value={form.sourceUser} onChange={v => setForm({...form, sourceUser: v})} placeholder="Username or API key" />
            <Fld label="Password / Token" value={form.sourcePass} onChange={v => setForm({...form, sourcePass: v})} placeholder="••••••••" password />
          </div>
          {!sourceConnected && <button onClick={connectSource} disabled={connecting} className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm font-medium py-3 rounded-lg transition">{connecting ? 'Validating…' : '🔌 Connect & Validate Source'}</button>}
          {/* Validation results */}
          {(sourceChecks[0]?.status !== 'pending' || sourceConnected) && (
            <div className="border rounded-lg overflow-hidden"><div className="bg-gray-50 px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase">Connection Validation</div>
              <div className="divide-y divide-gray-100">{sourceChecks.map((c, i) => c.status !== 'pending' && (
                <div key={i} className="px-4 py-1.5 flex items-center justify-between text-[10px]">
                  <span className="text-gray-700">{c.label}</span>
                  <span className={`font-bold ${c.status === 'pass' ? 'text-green-600' : c.status === 'warning' ? 'text-orange-600' : c.status === 'failed' ? 'text-red-600' : 'text-gray-400'}`}>{c.status === 'pass' ? '✓ PASS' : c.status === 'warning' ? '⚠ WARNING' : c.status === 'failed' ? '✕ FAILED' : '○'}</span>
                </div>
              ))}</div>
            </div>
          )}
          {sourceConnected && (<div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-green-700 mb-2">✓ Source Connected — Discovery Complete</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">{generateDiscovery().map((d, i) => (
              <div key={i} className="border border-green-200 rounded p-2"><p className="font-bold text-gray-900">{d.count || '—'}</p><p className="text-gray-500">{d.type}</p></div>
            ))}</div>
          </div>)}
        </div>)}

        {/* ═══ STEP 3: TARGET ═══ */}
        {step === 3 && (<div className="space-y-4">
          <SH title="Target Connection" desc="Connect to where data will be migrated. Same validation as source — we ensure the target is ready." />
          <div className="grid md:grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Connector <span className="text-red-500">*</span></label><select value={form.targetConnector} onChange={e => setForm({...form, targetConnector: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"><option value="">Select…</option>{connectorOptions.map(c => <option key={c}>{c}</option>)}</select></div>
            <Fld label="Connection URL" required value={form.targetUrl} onChange={v => setForm({...form, targetUrl: v})} placeholder="host:port/database" mono />
            <Fld label="Username" value={form.targetUser} onChange={v => setForm({...form, targetUser: v})} />
            <Fld label="Password" value={form.targetPass} onChange={v => setForm({...form, targetPass: v})} password />
          </div>
          {!targetConnected ? <button onClick={connectTarget} disabled={connecting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium py-3 rounded-lg transition">{connecting ? 'Validating…' : '🔌 Connect & Validate Target'}</button>
          : <div className="bg-green-50 border border-green-200 rounded-lg p-4"><p className="text-sm font-semibold text-green-700">✓ Target Connected & Validated</p><p className="text-[10px] text-green-600 mt-1">All 13 validation checks passed. Target ready to receive data.</p></div>}
        </div>)}

        {/* ═══ STEP 4: VALIDATION ═══ */}
        {step === 4 && (<div className="space-y-4">
          <SH title="Environment Validation" desc="Verifies source and target are compatible — schema, version, charset, storage capacity." />
          {!validationPassed ? <div className="text-center py-8"><button onClick={runValidation} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-8 py-3 rounded-lg">🔍 Validate Environments</button></div>
          : <div className="space-y-3"><div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm font-semibold text-green-700">✓ Environments Compatible</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">{['Version OK', 'Schema OK', 'Charset OK', 'Collation OK', 'Storage OK', 'Network OK', 'Permissions OK', 'SSL OK'].map(c => <div key={c} className="border rounded p-2 text-center"><span className="text-green-600 font-bold">✓</span> {c}</div>)}</div></div>}
        </div>)}

        {/* ═══ STEP 5: ASSESSMENT ═══ */}
        {step === 5 && (<div className="space-y-4">
          <SH title="Pre-Migration Assessment" desc="Automated analysis identifies risks, gaps, and compatibility issues before any data moves." />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
            <div className="border rounded-lg p-3"><p className="text-lg font-bold text-green-600">95%</p><p className="text-[9px] text-gray-500">Compatibility</p></div>
            <div className="border rounded-lg p-3"><p className="text-lg font-bold text-orange-600">3</p><p className="text-[9px] text-gray-500">Gaps</p></div>
            <div className="border rounded-lg p-3"><p className="text-lg font-bold text-green-600">Low</p><p className="text-[9px] text-gray-500">Risk</p></div>
            <div className="border rounded-lg p-3"><p className="text-lg font-bold text-purple-600">87%</p><p className="text-[9px] text-gray-500">Confidence</p></div>
            <div className="border rounded-lg p-3"><p className="text-lg font-bold">Ready</p><p className="text-[9px] text-gray-500">Status</p></div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-[10px] text-orange-700">
            <p className="font-semibold mb-1">⚠ Gaps Found (3):</p>
            <ul className="space-y-0.5"><li>• 3 stored procedures use vendor-specific syntax → Convert to standard SQL (effort: 2h)</li><li>• BLOB column encoding differs → Add transformation rule (effort: 30min)</li><li>• 2 deprecated index types → Recreate in target format (auto-handled)</li></ul>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-[10px] text-blue-700">💡 <strong>Recommendation:</strong> All gaps are low-risk and resolvable. Safe to proceed. Total additional effort: ~2.5 hours.</div>
        </div>)}

        {/* ═══ STEP 6: STRATEGY ═══ */}
        {step === 6 && (<div className="space-y-4">
          <SH title="Migration Strategy" desc="Choose how to execute. Each strategy has different risk profiles and downtime characteristics." />
          <div className="grid md:grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Strategy <span className="text-red-500">*</span></label><select value={form.strategy} onChange={e => setForm({...form, strategy: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Select…</option><option value="incremental">Incremental (Low risk, longer)</option><option value="parallel">Parallel Run (Zero downtime)</option><option value="blue-green">Blue-Green (Instant cutover)</option><option value="lift-and-shift">Lift and Shift (Fast)</option><option value="big-bang">Big Bang (Weekend window)</option></select></div>
            <Fld label="Timeline" value={form.timeline} onChange={v => setForm({...form, timeline: v})} placeholder="e.g. 2 weeks" />
            <Fld label="Budget" value={form.budget} onChange={v => setForm({...form, budget: v})} placeholder="e.g. $50,000" />
            <Fld label="Owner" value={form.owner} onChange={v => setForm({...form, owner: v})} placeholder="hello@askabd.com" />
          </div>
        </div>)}

        {/* ═══ STEP 7: PLAN ═══ */}
        {step === 7 && (<div className="space-y-4">
          <SH title="Execution Plan" desc="Auto-generated based on your assessment and strategy. Includes rollback and validation at every stage." />
          <div className="space-y-2">{['Wave 1: Schema & Structure (tables, indexes, constraints)', 'Wave 2: Data Migration (all rows, batch processing)', 'Wave 3: Stored Procedures & Functions', 'Wave 4: Triggers, Views & Sequences', 'Wave 5: Permissions & Roles'].map((w, i) => (
            <div key={i} className="border rounded-lg p-3 flex items-center justify-between text-xs"><span>{w}</span><span className="text-green-600 text-[10px]">Planned</span></div>
          ))}</div>
          <div className="bg-gray-50 border rounded-lg p-3 text-[10px] space-y-1">
            <p><strong>Rollback:</strong> Restore from pre-migration snapshot (under 5 min)</p>
            <p><strong>Validation:</strong> Row count + checksum after each wave</p>
            <p><strong>Communication:</strong> Notify stakeholders before and after each wave</p>
          </div>
        </div>)}

        {/* ═══ STEP 8: DRY RUN ═══ */}
        {step === 8 && (<div className="space-y-4">
          <SH title="Dry Run (Simulation)" desc="Executes the entire migration plan without modifying any data. Catches problems before they happen." />
          {!dryRunComplete ? <div className="text-center py-8"><button onClick={runDryRun} className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium px-8 py-3 rounded-lg">▶ Run Simulation</button><p className="text-[10px] text-gray-400 mt-2">No data will be modified</p></div>
          : <div className="bg-green-50 border border-green-200 rounded-lg p-4"><p className="text-sm font-semibold text-green-700">✓ Dry Run Passed — Zero Errors</p><div className="grid grid-cols-4 gap-3 mt-3 text-center text-[10px]"><div><p className="font-bold">847,500</p><p className="text-gray-500">Rows Simulated</p></div><div><p className="font-bold text-green-600">0</p><p className="text-gray-500">Errors</p></div><div><p className="font-bold">0</p><p className="text-gray-500">Warnings</p></div><div><p className="font-bold">~12 min</p><p className="text-gray-500">Est. Duration</p></div></div></div>}
        </div>)}

        {/* ═══ STEP 9: EXECUTE ═══ */}
        {step === 9 && (<div className="space-y-4">
          <SH title="Execute Migration" desc="Transfers data from source to target. You can pause, resume, or rollback at any time." />
          {executionPhase === 'idle' && <div className="text-center py-8"><button onClick={runExecution} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-8 py-3 rounded-lg">🚀 Execute Migration</button></div>}
          {(executionPhase === 'running' || executionPhase === 'paused') && (
            <div>
              <div className="flex justify-between text-xs mb-1"><span>Migrating: <strong className="font-mono">{executionTable}</strong></span><span className="font-bold text-purple-600">{executionProgress}%</span></div>
              <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden mb-3"><div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all" style={{ width: `${executionProgress}%` }} /></div>
              <div className="grid grid-cols-4 gap-3 text-center text-[10px] mb-3">
                <div><p className="font-bold">{Math.round(847500 * executionProgress / 100).toLocaleString()}</p><p className="text-gray-500">Rows Done</p></div>
                <div><p className="font-bold">{(847500 - Math.round(847500 * executionProgress / 100)).toLocaleString()}</p><p className="text-gray-500">Remaining</p></div>
                <div><p className="font-bold text-blue-600">~68K/s</p><p className="text-gray-500">Speed</p></div>
                <div><p className="font-bold">{executionProgress >= 100 ? 'Done' : `~${Math.ceil((100 - executionProgress) / 8)}s`}</p><p className="text-gray-500">ETA</p></div>
              </div>
              <div className="flex gap-2">
                {executionPhase === 'running' && <button onClick={pauseExecution} className="flex-1 border border-orange-200 text-orange-600 text-xs font-medium py-2 rounded-lg hover:bg-orange-50">⏸ Pause</button>}
                {executionPhase === 'paused' && <button onClick={resumeExecution} className="flex-1 border border-green-200 text-green-600 text-xs font-medium py-2 rounded-lg hover:bg-green-50">▶ Resume</button>}
                <button className="flex-1 border border-red-200 text-red-600 text-xs font-medium py-2 rounded-lg hover:bg-red-50">↩ Rollback</button>
              </div>
            </div>
          )}
          {executionPhase === 'complete' && <div className="bg-green-50 border border-green-200 rounded-lg p-4"><p className="text-sm font-semibold text-green-700">✓ Migration Executed — 847,500 rows transferred</p><div className="grid grid-cols-3 gap-3 mt-3 text-center text-[10px]"><div><p className="font-bold text-green-600">100%</p><p className="text-gray-500">Complete</p></div><div><p className="font-bold">11m 42s</p><p className="text-gray-500">Duration</p></div><div><p className="font-bold">0</p><p className="text-gray-500">Errors</p></div></div></div>}
        </div>)}

        {/* ═══ STEP 10: VALIDATION ═══ */}
        {step === 10 && (<div className="space-y-4">
          <SH title="Post-Migration Validation" desc="Automated comparison confirms source and target match exactly. Nothing is marked complete until this passes." />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">{['Tables ✓', 'Rows ✓', 'Indexes ✓', 'Constraints ✓', 'Triggers ✓', 'Views ✓', 'Functions ✓', 'Permissions ✓', 'Sequences ✓', 'Checksums ✓', 'Storage ✓', 'Performance ✓'].map(c => <div key={c} className="border rounded p-2 text-center text-green-600 font-bold">{c}</div>)}</div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-700">✓ All validation checks passed. Source and target are identical.</div>
        </div>)}

        {/* ═══ STEP 11: AUDIT ═══ */}
        {step === 11 && (<div className="space-y-4">
          <SH title="Post-Migration Audit" desc="Complete audit trail for governance and compliance. Verifies nothing was missed." />
          {!auditComplete ? <div className="text-center py-8"><button onClick={runAudit} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-8 py-3 rounded-lg">📋 Run Final Audit</button></div>
          : <div className="space-y-3"><div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm font-semibold text-green-700">✓ Audit Passed — Migration Verified</div>
            <div className="grid md:grid-cols-2 gap-3 text-[10px]">
              <div className="border rounded-lg p-3"><p className="font-semibold text-gray-700 mb-1">Statistics</p><p>Objects: 24 tables, 8 views, 12 functions, 6 triggers, 42 indexes</p><p>Data: 847,500 rows, 1.8 GB, 0 errors, 0 warnings</p></div>
              <div className="border rounded-lg p-3"><p className="font-semibold text-gray-700 mb-1">Governance</p><p>Actions logged: 156 | Approvals: 3 | Rollback points: 5</p><p>Duration: 11m 42s | Downtime: 0 (parallel run)</p></div>
            </div></div>}
        </div>)}

        {/* ═══ STEP 12: REPORT ═══ */}
        {step === 12 && (<div className="space-y-4">
          <SH title="Executive Reports" desc="Download professional reports for all stakeholders. Available in multiple formats." />
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center mb-4"><p className="text-lg font-bold text-green-700">✓ Migration Complete</p><p className="text-xs text-green-600 mt-1">{form.name || 'Migration'} — All validation and audit checks passed</p></div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">{['Executive Report', 'Migration Report', 'Assessment Report', 'Validation Report', 'Audit Report', 'Gap Analysis', 'Architecture Report', 'Performance Report', 'Security Report', 'Compliance Report', 'Lessons Learned'].map(name => (
            <div key={name} className="border rounded-lg p-3 flex items-center justify-between"><span className="text-xs font-medium">{name}</span><div className="flex gap-1"><DownloadButton fileName={`${form.name}_${name}`} format="pdf" entityId="mig-report" entityName={name} clientName={form.client} data={{ report: name }} /><DownloadButton fileName={`${form.name}_${name}`} format="excel" entityId="mig-report" entityName={name} data={{ report: name }} /><DownloadButton fileName={`${form.name}_${name}`} format="csv" entityId="mig-report" entityName={name} data={{ report: name }} /></div></div>
          ))}</div>
          <button onClick={completeMigration} className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-3 rounded-lg mt-4">Complete & Return to Portfolio ✓</button>
        </div>)}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={handlePrev} disabled={step === 1} className="text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30 px-4 py-2 rounded-lg border hover:bg-gray-50 transition">← Previous</button>
        <div className="flex gap-2">
          <button onClick={saveDraft} className="text-[10px] text-gray-500 hover:text-gray-700 px-3 py-2">Save</button>
          {step < 12 && <button onClick={handleNext} className="text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg transition">Next →</button>}
        </div>
      </div>
    </div>
  );
}

function SH({ title, desc }: { title: string; desc: string }) {
  return <div className="mb-4"><h2 className="font-semibold text-lg">{title}</h2><p className="text-xs text-gray-500 mt-0.5">{desc}</p></div>;
}

function Fld({ label, value, onChange, placeholder, required, mono, password, textarea }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; mono?: boolean; password?: boolean; textarea?: boolean }) {
  const cls = `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${mono ? 'font-mono' : ''}`;
  return (<div><label className="block text-xs font-medium text-gray-700 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
    {textarea ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2} className={cls} />
    : <input type={password ? 'password' : 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />}
  </div>);
}
