import Link from 'next/link';
import { mockClients } from '../lib/mock-clients';
import { Breadcrumb } from '../components/breadcrumb';
import { statusColor } from '../components/status-badge';
import { ServiceControlsInline } from '../components/service-controls';

export default function ApplicationsPage() {
  const allApps = mockClients.flatMap(c =>
    c.applications.map(app => ({
      name: app,
      clientId: c.id,
      clientName: c.name,
      health: c.health,
      environment: c.environments.production.status,
    }))
  );

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Applications' }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Applications</h1>
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-6 py-3">Application</th>
                <th className="text-left px-4 py-3">Client</th>
                <th className="text-left px-4 py-3">Health</th>
                <th className="text-left px-4 py-3">Production</th>
                <th className="text-center px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allApps.map((app, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <Link href={`/clients/${app.clientId}?tab=applications`} className="font-medium text-gray-900 hover:text-purple-700">
                      {app.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/clients/${app.clientId}`} className="text-gray-600 hover:text-purple-700">{app.clientName}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className={`w-2 h-2 rounded-full ${statusColor(app.health)}`} />
                      {app.health}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className={`w-2 h-2 rounded-full ${statusColor(app.environment)}`} />
                      {app.environment}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ServiceControlsInline entityId={`${app.clientId}-${app.name}`} entityName={app.name} entityType="application" initialEnabled={app.health !== 'offline'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
