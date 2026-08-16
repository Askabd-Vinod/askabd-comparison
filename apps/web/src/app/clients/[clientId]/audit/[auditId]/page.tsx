import { CapabilityPlaceholder } from '../../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../../lib/mock-clients';
import { Breadcrumb } from '../../../../components/breadcrumb';

interface Props { params: Promise<{ clientId: string; auditId: string }> }

export default async function AuditDetailPage({ params }: Props) {
  const { clientId, auditId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="[audit Id]" description="[audit Id] management for this client." />;
  const entry = client.auditLog.find(a => a.id === auditId);
  if (!entry) notFound();

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Clients', href: '/clients' },
        { label: client.name, href: `/clients/${clientId}` },
        { label: 'Audit', href: `/clients/${clientId}/audit` },
        { label: entry.what },
      ]} />

      <h1 className="text-xl font-bold mb-6">Audit Entry</h1>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-4">Change Details</h2>
            <div className="space-y-3 text-xs">
              <Row label="Action" value={entry.what} />
              <Row label="Performed By" value={entry.who} />
              <Row label="Timestamp" value={new Date(entry.when).toLocaleString('en-AU')} />
              <Row label="Environment" value={entry.environment} />
              <Row label="IP Address" value={entry.ip} />
              <Row label="Correlation ID" value={entry.correlationId} />
              <div className="border-t pt-3 mt-3" />
              <Row label="Previous Value" value={entry.oldValue} />
              <Row label="New Value" value={entry.newValue} />
              <div className="border-t pt-3 mt-3" />
              <Row label="Source" value="Platform UI" />
              <Row label="Approval" value="Auto-approved (Super Admin)" />
              <Row label="Reversible" value="Yes" />
            </div>
          </section>

          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Impact Assessment</h2>
            <p className="text-xs text-gray-600">This change was applied to the <strong>{entry.environment}</strong> environment. No service disruption detected post-change. Change correlates with deployment pipeline activity.</p>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Related Entities</h3>
            <div className="space-y-1.5">
              <QuickLink href={`/clients/${clientId}/deployments`} label="Linked Deployments" />
              <QuickLink href={`/clients/${clientId}/incidents`} label="Linked Incidents" />
              <QuickLink href={`/clients/${clientId}/alerts`} label="Linked Alerts" />
              <QuickLink href={`/clients/${clientId}/settings`} label="Configuration" />
              <QuickLink href={`/clients/${clientId}/environments`} label={`${entry.environment} Environment`} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-medium text-gray-800 text-right max-w-[60%] break-all">{value}</span></div>; }
function QuickLink({ href, label }: { href: string; label: string }) { return <Link href={href} className="block text-xs text-gray-600 hover:text-purple-600 py-1.5 px-2 rounded hover:bg-purple-50 transition">{label}</Link>; }
