import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../../lib/mock-clients';
import { apiSafe } from '../../../../lib/api';
import { serviceCatalog } from '../../../../lib/service-catalog';
import { connectorCatalog } from '../../../../lib/connectors';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientSettingsPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Settings" description="Settings management for this client." />;

  const flags = await apiSafe<Record<string, boolean>>('/platform/flags', {});
  const clientStatus = client.health === 'offline' ? 'Suspended' : 'Active';

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Client Administration</h2>
      <p className="text-xs text-gray-500 mb-6">Lifecycle management, platform toggles, service configuration, and security — Super Admin: hello@askabd.com</p>

      {/* Client Status & Lifecycle */}
      <section className="bg-white rounded-xl border p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Client Lifecycle</h3>
          <span className={`text-[10px] font-medium px-3 py-1 rounded ${clientStatus === 'Active' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{clientStatus}</span>
        </div>
        {/* Previously every one of these 8 buttons had no onClick handler at
            all — clicking any of them did nothing, no feedback, no error.
            Found during the 2026-08-22 global UX audit. "Edit Client" now
            links to the real edit page (which does exist); the rest have no
            backing API yet, so they're honestly disabled with a real reason
            rather than left looking clickable while doing nothing. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <ActionBtn label="Edit Client" icon="✏️" href={`/clients/${clientId}/edit`} />
          <ActionBtn label="Suspend" icon="⏸️" variant="warning" disabledReason="Not yet available — no backend endpoint exists for this action." />
          <ActionBtn label="Archive" icon="📦" variant="warning" disabledReason="Not yet available — no backend endpoint exists for this action." />
          <ActionBtn label="Maintenance Mode" icon="🔧" disabledReason="Not yet available — no backend endpoint exists for this action." />
          <ActionBtn label="Clone Client" icon="📋" disabledReason="Not yet available — no backend endpoint exists for this action." />
          <ActionBtn label="Export Client" icon="📤" disabledReason="Not yet available — no backend endpoint exists for this action." />
          <ActionBtn label="Transfer Ownership" icon="🔄" disabledReason="Not yet available — no backend endpoint exists for this action." />
          <ActionBtn label="Renew Subscription" icon="🔑" variant="success" disabledReason="Not yet available — no backend endpoint exists for this action." />
        </div>
        <div className="grid md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-2">
            <Row label="Client ID" value={client.id} />
            <Row label="Status" value={clientStatus} />
            <Row label="Business Unit" value={client.industry} />
          </div>
          <div className="space-y-2">
            <Row label="Organization" value={client.name} />
            <Row label="Primary Contact" value={client.primaryContact} />
            <Row label="SLA Tier" value={client.slaStatus === 'compliant' ? 'Enterprise' : 'Standard'} />
            <Row label="Platform Score" value={`${client.platformScore}/100`} />
          </div>
        </div>
        {/* Previously showed hardcoded "Lifecycle: Production", "Subscription:
            Enterprise", "Region: APAC", "Created: 2026-01-15", "Last Modified:
            2026-08-03" — identical literal values for every client regardless
            of reality, with no backing data at all. Removed rather than kept
            as fake facts — see the platform's standing "never fabricate,
            show unavailable instead" rule. */}
        <p className="text-[10px] text-gray-400 mt-3">Lifecycle stage, subscription tier, region, and creation/modification dates are not yet tracked per client.</p>
      </section>

      {/* Platform Module Toggles */}
      <section className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="font-semibold mb-4">Platform Modules</h3>
        <p className="text-[10px] text-gray-400 mb-3">Enable or disable platform capabilities for this client</p>
        <div className="grid md:grid-cols-2 gap-2">
          <Toggle label="Platform Monitoring" enabled description="Infrastructure & application monitoring" />
          <Toggle label="Automation Engine" enabled description="AI-powered auto-resolution" />
          <Toggle label="Connector Framework" enabled description="External system integrations" />
          <Toggle label="Reporting Engine" enabled description="Automated report generation" />
          <Toggle label="Knowledge Base" enabled description="Runbooks, articles, best practices" />
          <Toggle label="AI Recommendations" enabled description="Evidence-based analysis & insights" />
          <Toggle label="Evidence Engine" enabled description="Automated evidence collection" />
          <Toggle label="Assessment Engine" enabled description="Maturity & readiness assessments" />
          <Toggle label="Proposal Generation" enabled description="Auto-generated consulting proposals" />
          <Toggle label="Service Catalog" enabled description="AskABD service enablement" />
          <Toggle label="Consulting Workspace" enabled description="Discovery, questions, deliverables" />
          <Toggle label="Transformation Roadmap" enabled description="Phased improvement planning" />
        </div>
      </section>

      {/* AskABD Services */}
      <section className="bg-white rounded-xl border p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">AskABD Services</h3>
          <Link href="/intelligence/catalog" className="text-[10px] text-purple-600 font-medium hover:text-purple-800">View Catalog →</Link>
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          {serviceCatalog.slice(0, 10).map(svc => {
            const isEnabled = client.activeServices.some(s => s.toLowerCase().includes(svc.name.split(' ')[0].toLowerCase()));
            return (
              <div key={svc.id} className={`flex items-center justify-between p-3 rounded-lg border ${isEnabled ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                <div>
                  <p className="text-xs font-medium">{svc.name}</p>
                  <p className="text-[9px] text-gray-400">{svc.category}</p>
                </div>
                <span className={`text-[9px] font-medium px-2 py-0.5 rounded ${isEnabled ? 'bg-green-200 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{isEnabled ? 'ENABLED' : 'DISABLED'}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Connector Status */}
      <section className="bg-white rounded-xl border p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Connectors</h3>
          <Link href={`/clients/${clientId}/connectors`} className="text-[10px] text-purple-600 font-medium hover:text-purple-800">Manage →</Link>
        </div>
        <div className="grid md:grid-cols-3 gap-2">
          {connectorCatalog.slice(0, 6).map(cat => (
            <div key={cat.category} className="border rounded-lg p-3">
              <p className="text-xs font-medium mb-1">{cat.label}</p>
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-gray-400">{cat.connectors.length} available</span>
                <span className="text-[9px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Configure</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* The four sections below (Notifications, Monitoring Thresholds,
          Maintenance & Hours, Escalation Matrix) show the same static
          values for every client — none of it is read from or writable to
          a per-client backend yet. Flagged during the 2026-08-22 global UX
          audit as a larger follow-up (needs real per-client settings
          storage, not a quick fix) rather than rushed here. */}
      <p className="text-[10px] text-gray-400 mb-2">The sections below are shown for reference only — they are not yet configurable per client.</p>
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Notifications */}
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold mb-3">Notifications</h3>
          <div className="space-y-2 text-xs">
            <Toggle label="Critical Alerts" enabled compact />
            <Toggle label="Warning Alerts" enabled compact />
            <Toggle label="Deployment Notifications" enabled compact />
            <Toggle label="Incident Updates" enabled compact />
            <Toggle label="Weekly Report" enabled compact />
            <Toggle label="Monthly Summary" enabled compact />
          </div>
        </section>

        {/* Thresholds */}
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold mb-3">Monitoring Thresholds</h3>
          <div className="space-y-2 text-xs">
            <ThresholdRow label="CPU Warning" value="80%" />
            <ThresholdRow label="CPU Critical" value="95%" />
            <ThresholdRow label="Memory Warning" value="85%" />
            <ThresholdRow label="Latency Warning" value="200ms" />
            <ThresholdRow label="Error Rate Warning" value="1%" />
            <ThresholdRow label="Availability SLA" value="99.9%" />
          </div>
        </section>

        {/* Maintenance Window */}
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold mb-3">Maintenance & Hours</h3>
          <div className="space-y-2 text-xs">
            <Row label="Maintenance Window" value="Sun 02:00–06:00 AEST" />
            <Row label="Frequency" value="Weekly" />
            <Row label="Business Hours" value="Mon–Fri 08:00–18:00" />
            <Row label="Timezone" value="Australia/Sydney" />
            <Row label="After-hours" value="Critical only" />
          </div>
        </section>

        {/* Escalation */}
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold mb-3">Escalation Matrix</h3>
          <div className="space-y-2 text-xs">
            <Row label="L1 (0-15 min)" value="ops@askabd.com" />
            <Row label="L2 (15-30 min)" value="hello@askabd.com" />
            <Row label="L3 (30-60 min)" value="hello@askabd.com + Client" />
            <Row label="Critical" value="Immediate L2" />
            <Row label="Major" value="15 min L1, then L2" />
          </div>
        </section>
      </div>

      {/* Feature Flags */}
      <section className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="font-semibold mb-3">Feature Flags (from Platform API)</h3>
        <div className="grid md:grid-cols-2 gap-2">
          {Object.entries(flags).length > 0 ? (
            Object.entries(flags).map(([key, enabled]) => (
              <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 text-xs">
                <span className="font-medium">{key}</span>
                <span className={`font-medium px-2 py-0.5 rounded ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{enabled ? 'ON' : 'OFF'}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-400 col-span-2">Feature flags loaded from backend API when connected.</p>
          )}
        </div>
      </section>

      {/* Danger Zone — previously every button here had no onClick at all
          and the page claimed "requires Super Admin approval" / "audited and
          require hello@askabd.com approval", implying a real approval
          workflow that does not exist. Found during the 2026-08-22 global
          UX audit — a non-functional destructive-actions panel is worse
          than none at all, since a real approval claim could make a staff
          member believe an irreversible action went through a safety check
          it never did. Honestly disabled instead, with the real reason. */}
      <section className="bg-white rounded-xl border border-red-200 p-5">
        <h3 className="font-semibold text-red-700 mb-3">Danger Zone</h3>
        <p className="text-[10px] text-gray-500 mb-3">These are irreversible, high-risk actions. None of them are wired to a backend yet — nothing here can currently be executed.</p>
        <div className="grid md:grid-cols-3 gap-2">
          <ActionBtn label="Suspend Client" icon="⏸️" variant="danger" disabledReason="Not yet available — no backend endpoint exists for this action." />
          <ActionBtn label="Disable All Services" icon="🚫" variant="danger" disabledReason="Not yet available — no backend endpoint exists for this action." />
          <ActionBtn label="Archive Client" icon="📦" variant="danger" disabledReason="Not yet available — no backend endpoint exists for this action." />
          <ActionBtn label="Terminate Contract" icon="❌" variant="danger" disabledReason="Not yet available — no backend endpoint exists for this action." />
          <ActionBtn label="Delete All Data" icon="🗑️" variant="danger" disabledReason="Not yet available — no backend endpoint exists for this action." />
          <ActionBtn label="Disconnect All Connectors" icon="🔌" variant="danger" disabledReason="Not yet available — no backend endpoint exists for this action." />
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-medium text-gray-800">{value}</span></div>;
}
function Toggle({ label, enabled, description, compact }: { label: string; enabled: boolean; description?: string; compact?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${compact ? 'py-1' : 'p-3 rounded-lg border border-gray-100'}`}>
      <div>
        <span className="text-xs font-medium text-gray-700">{label}</span>
        {description && <p className="text-[9px] text-gray-400">{description}</p>}
      </div>
      <span className={`text-[9px] font-medium px-2 py-0.5 rounded ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{enabled ? 'ON' : 'OFF'}</span>
    </div>
  );
}
function ThresholdRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between py-1"><span className="text-gray-600">{label}</span><span className="font-mono font-medium text-gray-800">{value}</span></div>;
}
function ActionBtn({ label, icon, variant, href, disabledReason }: { label: string; icon: string; variant?: 'warning' | 'danger' | 'success'; href?: string; disabledReason?: string }) {
  const colors = variant === 'danger' ? 'border-red-200 text-red-700 hover:bg-red-50' : variant === 'warning' ? 'border-orange-200 text-orange-700 hover:bg-orange-50' : variant === 'success' ? 'border-green-200 text-green-700 hover:bg-green-50' : 'border-gray-200 text-gray-700 hover:bg-gray-50';
  if (href) {
    return <Link href={href} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-medium transition ${colors}`}><span>{icon}</span>{label}</Link>;
  }
  if (disabledReason) {
    return (
      <button disabled title={disabledReason} aria-disabled="true" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-gray-400 text-[10px] font-medium cursor-not-allowed">
        <span className="opacity-50">{icon}</span>{label}
      </button>
    );
  }
  return <button className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-medium transition ${colors}`}><span>{icon}</span>{label}</button>;
}
