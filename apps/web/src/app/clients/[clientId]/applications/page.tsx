import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../lib/mock-clients';
import { statusColor } from '../../../components/status-badge';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientApplicationsPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Applications" description="Applications management for this client." />;

  const apps = client.applications.map((name, i) => ({
    name,
    environment: 'production' as const,
    version: client.environments.production.version,
    owner: client.primaryContact,
    status: client.health,
    health: client.health,
    deployment: client.lastDeployment,
    lastRelease: client.environments.production.release,
    technology: ['Next.js', 'React', 'Node.js', 'TypeScript'][i % 4],
    openIssues: Math.floor(Math.random() * 5),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">Applications ({apps.length})</h2>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-5 py-3">Application</th>
                <th className="text-left px-4 py-3">Environment</th>
                <th className="text-left px-4 py-3">Version</th>
                <th className="text-left px-4 py-3">Owner</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Health</th>
                <th className="text-left px-4 py-3">Last Release</th>
                <th className="text-left px-4 py-3">Technology</th>
                <th className="text-center px-4 py-3">Issues</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {apps.map((app, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link href={`/clients/${clientId}/applications?app=${encodeURIComponent(app.name)}`} className="font-medium text-gray-900 hover:text-purple-700">
                      {app.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize text-xs">{app.environment}</td>
                  <td className="px-4 py-3 font-mono text-xs">{app.version}</td>
                  <td className="px-4 py-3 text-xs">{app.owner}</td>
                  <td className="px-4 py-3"><span className="flex items-center gap-1.5 text-xs"><span className={`w-2 h-2 rounded-full ${statusColor(app.status)}`} />{app.status}</span></td>
                  <td className="px-4 py-3"><span className="flex items-center gap-1.5 text-xs"><span className={`w-2 h-2 rounded-full ${statusColor(app.health)}`} />{app.health}</span></td>
                  <td className="px-4 py-3 text-xs">{app.lastRelease}</td>
                  <td className="px-4 py-3 text-xs">{app.technology}</td>
                  <td className="px-4 py-3 text-center"><span className={`text-xs font-medium ${app.openIssues > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{app.openIssues}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
