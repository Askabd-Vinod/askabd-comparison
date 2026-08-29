import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../../lib/mock-clients';
import { DemoDataBanner } from '../../../../components/demo-data-banner';
import { AIInsightsPanel } from '../../../../components/ai-insights';
import { SolutionRecommendation, Solution } from '../../../../components/solution-recommendation';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientAutomationPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Automation" description="Automation management for this client." />;

  const automations = [
    { id: 'auto-1', name: 'Auto-scale on CPU threshold', trigger: 'CPU > 80% for 5 min', target: 'Kubernetes', status: 'active', lastRun: '2026-08-02T14:00:00Z', approver: 'hello@askabd.com', dryRun: true },
    { id: 'auto-2', name: 'Certificate renewal', trigger: '30 days before expiry', target: 'Infrastructure', status: 'active', lastRun: '2026-07-15T02:00:00Z', approver: 'hello@askabd.com', dryRun: false },
    { id: 'auto-3', name: 'Database backup verification', trigger: 'Daily at 03:00', target: 'PostgreSQL', status: 'active', lastRun: '2026-08-03T03:00:00Z', approver: 'ops@askabd.com', dryRun: false },
    { id: 'auto-4', name: 'Incident auto-detection', trigger: 'Error rate > 5%', target: 'Monitoring', status: 'active', lastRun: '2026-08-01T16:00:00Z', approver: 'hello@askabd.com', dryRun: true },
  ];

  const workflow = [
    { step: 1, label: 'Detect', description: 'Automated monitoring detects anomaly', status: 'automated' },
    { step: 2, label: 'Collect Evidence', description: 'System gathers logs, metrics, recent changes', status: 'automated' },
    { step: 3, label: 'Generate RCA', description: 'AI produces root cause analysis', status: 'automated' },
    { step: 4, label: 'Recommend Solution', description: 'Evidence-backed remediation generated', status: 'automated' },
    { step: 5, label: 'Simulate Outcome', description: 'Dry-run shows expected impact', status: 'automated' },
    { step: 6, label: 'Human Approval', description: 'Engineer reviews and approves', status: 'manual' },
    { step: 7, label: 'Execute', description: 'Approved automation executes', status: 'automated' },
    { step: 8, label: 'Validate', description: 'Post-execution health verified', status: 'automated' },
    { step: 9, label: 'Learn', description: 'Lessons captured in knowledge base', status: 'automated' },
  ];

  return (
    <div>
      <DemoDataBanner />
      <h2 className="font-semibold text-lg mb-1">Intelligent Auto-Resolution</h2>
      <p className="text-xs text-gray-500 mb-6">AI-powered detection, analysis, and approved automated remediation</p>

      {/* Safety Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <p className="text-xs text-blue-800 font-medium">🛡️ Safety First — No automation executes without explicit human approval. Every action supports dry-run, rollback, and audit trail.</p>
      </div>

      {/* Workflow */}
      <section className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="font-semibold mb-4">Resolution Workflow</h3>
        <div className="flex flex-wrap gap-2">
          {workflow.map(step => (
            <div key={step.step} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${step.status === 'manual' ? 'border-orange-200 bg-orange-50' : 'border-green-200 bg-green-50'}`}>
              <span className="text-[10px] font-bold text-gray-500">{step.step}</span>
              <div>
                <p className="text-xs font-medium">{step.label}</p>
                <p className="text-[9px] text-gray-500">{step.description}</p>
              </div>
              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${step.status === 'manual' ? 'bg-orange-200 text-orange-700' : 'bg-green-200 text-green-700'}`}>{step.status}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Active Automations */}
      <section className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="font-semibold mb-4">Active Automations ({automations.length})</h3>
        <div className="space-y-2">
          {automations.map(auto => (
            <div key={auto.id} className="flex items-center justify-between py-3 px-4 rounded-lg border hover:border-purple-200 transition">
              <div>
                <p className="text-sm font-medium">{auto.name}</p>
                <p className="text-[10px] text-gray-500">Trigger: {auto.trigger} • Target: {auto.target}</p>
              </div>
              <div className="flex items-center gap-3">
                {auto.dryRun && <span className="text-[9px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">Dry Run</span>}
                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">{auto.status}</span>
                <span className="text-[10px] text-gray-400">Approver: {auto.approver}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Safety Controls */}
      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold mb-3">Safety Controls</h3>
          <div className="space-y-2 text-xs">
            <SafetyRow label="Dry Run Support" status="enabled" />
            <SafetyRow label="Impact Assessment" status="enabled" />
            <SafetyRow label="Approval Workflow" status="required" />
            <SafetyRow label="Execution Logging" status="enabled" />
            <SafetyRow label="Rollback Capability" status="enabled" />
            <SafetyRow label="Validation Checks" status="enabled" />
            <SafetyRow label="Audit Trail" status="enabled" />
            <SafetyRow label="Risk Assessment" status="enabled" />
            <SafetyRow label="Manual Override" status="available" />
            <SafetyRow label="Emergency Stop" status="available" />
          </div>
        </section>

        <AIInsightsPanel insights={[
          { type: 'recommendation', severity: 'low', title: 'Automation coverage adequate', description: `${automations.length} automations active. All require human approval before execution.` },
          { type: 'prediction', severity: 'low', title: 'Estimated time savings', description: 'Current automations estimated to reduce manual effort by 60% for routine operations.' },
        ]} title="Automation Intelligence" />
      </div>
    </div>
  );
}

function SafetyRow({ label, status }: { label: string; status: string }) {
  const color = status === 'enabled' || status === 'required' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700';
  return <div className="flex items-center justify-between py-1"><span className="text-gray-600">{label}</span><span className={`text-[10px] font-medium px-2 py-0.5 rounded ${color}`}>{status}</span></div>;
}
