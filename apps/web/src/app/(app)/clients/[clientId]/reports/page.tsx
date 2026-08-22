import Link from 'next/link';
import { mockClients } from '../../../../lib/mock-clients';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientReportsPage({ params }: PageProps) {
  const { clientId } = await params;
  const demoClient = mockClients.find(c => c.id === clientId);
  if (demoClient) return <DemoReports client={demoClient} />;
  return <RealReports clientId={clientId} />;
}

/**
 * Real client reporting summary — did not exist before the final closure pass (every
 * real client fell through to a generic placeholder here). Every number below traces
 * to a real, client-scoped GET request against the real database — never a fabricated
 * or templated figure. No PDF/Excel/CSV export exists yet for a real client, so those
 * are not offered here (they were purely decorative badges before, not a real
 * capability) rather than implying a download that doesn't happen.
 */
async function RealReports({ clientId }: { clientId: string }) {
  async function safeCount(path: string): Promise<{ count: number; ok: boolean }> {
    try {
      const res = await fetch(`${API}${path}`, { cache: 'no-store' });
      if (!res.ok) return { count: 0, ok: false };
      const data = await res.json();
      const arr = data.incidents || data.defects || data.migrations || data.remediations || [];
      return { count: Array.isArray(arr) ? arr.length : 0, ok: true };
    } catch {
      return { count: 0, ok: false };
    }
  }

  const [incidents, defects, migrations, remediations] = await Promise.all([
    safeCount(`/api/v1/oc/incidents?clientId=${clientId}`),
    safeCount(`/api/v1/oc/defects?clientId=${clientId}`),
    safeCount(`/api/v1/oc/migrations?clientId=${clientId}`),
    safeCount(`/api/v1/oc/remediations?clientId=${clientId}`),
  ]);

  const cards = [
    { label: 'Incidents', ...incidents, href: `/clients/${clientId}/incidents` },
    { label: 'Defects', ...defects, href: `/engineering` },
    { label: 'Migrations', ...migrations, href: `/clients/${clientId}/migrations` },
    { label: 'Remediations', ...remediations, href: `/clients/${clientId}/incidents` },
  ];

  return (
    <div>
      <h2 className="font-semibold text-lg mb-4">Reports</h2>
      <p className="text-xs text-gray-500 mb-4">Real counts from this client&apos;s own records. Click through for full detail and history.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {cards.map(c => (
          <Link key={c.label} href={c.href} className="bg-white rounded-xl border p-3 text-center hover:border-purple-200 hover:shadow-sm transition">
            {c.ok ? (
              <p className="text-lg font-bold text-gray-900">{c.count}</p>
            ) : (
              <p className="text-lg font-bold text-gray-300" title="Could not load — try refreshing">—</p>
            )}
            <p className="text-[10px] text-gray-500">{c.label}</p>
          </Link>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">
        <p className="font-semibold mb-1">Report export not yet available</p>
        <p>PDF/Excel/CSV generation for a real client is not yet implemented. Use the linked detail pages above for the underlying real records.</p>
      </div>
    </div>
  );
}

/** Original demo-data rendering — unchanged, covered by DemoDataBanner in the shared layout. */
function DemoReports({ client }: { client: NonNullable<ReturnType<typeof mockClients.find>> }) {
  const reports = [
    { id: 'health', name: 'Health Report', description: 'Platform health and uptime metrics', icon: '💚' },
    { id: 'availability', name: 'Availability Report', description: 'Service availability and SLA adherence', icon: '📊' },
    { id: 'performance', name: 'Performance Report', description: 'Latency, throughput, resource usage', icon: '⚡' },
    { id: 'incidents', name: 'Incident Report', description: 'Incident history and resolution metrics', icon: '🚨' },
    { id: 'deployments', name: 'Deployment Report', description: 'Deployment frequency and success rate', icon: '🚀' },
    { id: 'security', name: 'Security Report', description: 'Vulnerability scans and compliance', icon: '🔒' },
    { id: 'audit', name: 'Audit Report', description: 'Change log and access audit trail', icon: '📝' },
  ];

  return (
    <div>
      <h2 className="font-semibold text-lg mb-4">Reports</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-lg font-bold text-green-600">{client.monitoring.availability}%</p>
          <p className="text-[10px] text-gray-500">Availability</p>
        </div>
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-lg font-bold">{client.deployments.length}</p>
          <p className="text-[10px] text-gray-500">Deployments</p>
        </div>
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-lg font-bold text-red-600">{client.incidents.length}</p>
          <p className="text-[10px] text-gray-500">Incidents</p>
        </div>
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-lg font-bold">{client.platformScore}</p>
          <p className="text-[10px] text-gray-500">Score</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map(report => (
          <Link
            key={report.id}
            href={`/reports/${report.id}`}
            className="bg-white rounded-xl border p-5 hover:shadow-md hover:border-purple-200 transition group"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">{report.icon}</span>
              <h3 className="font-semibold text-sm group-hover:text-purple-700">{report.name}</h3>
            </div>
            <p className="text-xs text-gray-500 mb-3">{report.description}</p>
            <div className="flex gap-2">
              <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded">PDF</span>
              <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded">Excel</span>
              <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded">CSV</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
