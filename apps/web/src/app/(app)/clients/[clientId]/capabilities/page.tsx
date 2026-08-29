import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../../lib/mock-clients';
import { statusColor } from '../../../../components/status-badge';
import { DemoDataBanner } from '../../../../components/demo-data-banner';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientCapabilitiesPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Capabilities" description="Capabilities management for this client." />;

  // PREVIOUSLY: each of these 5 capabilities carried its own "maturity %"
  // computed by adding/subtracting an arbitrary constant (+5, +10, -5, -10)
  // from the single client.platformScore field — arithmetic on one real
  // number presented as five independent measurements. Same anti-pattern
  // already fixed on the Readiness page (see its doc comment). No real
  // per-capability maturity metric exists yet, so rather than keep
  // fabricating one, this now shows the one real number that does exist
  // (platformScore) once, and is honest that per-capability scoring isn't
  // available. Found during the 2026-08-22 global UX audit.
  const capabilities = [
    { name: 'Customer Management', owner: client.primaryContact, apps: client.applications.slice(0, 2), criticality: 'high', health: client.health, processes: ['Customer Onboarding', 'Account Management'] },
    { name: 'Order Processing', owner: client.primaryContact, apps: client.applications.slice(0, 1), criticality: 'high', health: client.health, processes: ['Order Fulfillment', 'Payment Processing'] },
    { name: 'Reporting & Analytics', owner: 'ops@askabd.com', apps: ['Analytics Dashboard'], criticality: 'medium', health: 'healthy' as const, processes: ['Report Generation', 'Data Analysis'] },
    { name: 'Identity & Access', owner: 'hello@askabd.com', apps: ['Auth Service'], criticality: 'high', health: 'healthy' as const, processes: ['Authentication', 'Authorization', 'User Provisioning'] },
    { name: 'Integration', owner: client.primaryContact, apps: ['API Gateway'], criticality: 'medium', health: client.health, processes: ['Data Sync', 'Event Processing'] },
  ];

  return (
    <div>
      <DemoDataBanner />
      <h2 className="font-semibold text-lg mb-1">Business Capability Map</h2>
      <p className="text-xs text-gray-500 mb-1">Business capabilities, processes, owners, and supporting technology</p>
      <p className="text-[11px] text-gray-400 mb-6">Overall platform score: <span className="font-semibold text-gray-600">{client.platformScore}/100</span>. Per-capability maturity scoring is not yet available — see the <Link href={`/clients/${clientId}/readiness`} className="text-purple-600 hover:underline">Readiness</Link> page for the real, evidence-based breakdown.</p>

      <div className="space-y-4 mb-6">
        {capabilities.map((cap, i) => (
          <section key={i} className="bg-white rounded-xl border p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${statusColor(cap.health)}`} />
                <h3 className="font-semibold text-sm">{cap.name}</h3>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${cap.criticality === 'high' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{cap.criticality} criticality</span>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4 text-xs">
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-1">Business Owner</p>
                <p className="text-gray-700">{cap.owner}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-1">Supporting Applications</p>
                <div className="flex flex-wrap gap-1">{cap.apps.map((a, j) => <Link key={j} href={`/clients/${clientId}/applications/${a.toLowerCase().replace(/\s+/g, '-')}`} className="bg-purple-50 text-purple-600 px-2 py-0.5 rounded hover:bg-purple-100 text-[11px]">{a}</Link>)}</div>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-1">Business Processes</p>
                <div className="flex flex-wrap gap-1">{cap.processes.map((p, j) => <span key={j} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[11px]">{p}</span>)}</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500">Services:</span>
                {client.services.slice(0, 3).map(s => <Link key={s.id} href={`/services/${s.id}`} className="text-[10px] text-purple-600 hover:text-purple-800">{s.name}</Link>)}
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Both insights previously here ("Integration capability maturity is
          below target" and the X/5-meeting-targets tally) existed only to
          narrate the fabricated per-capability maturity numbers removed
          above — with those gone, neither claim has real data behind it.
          Removed rather than left dangling with no supporting evidence. */}
    </div>
  );
}
