import { Breadcrumb } from '../../components/breadcrumb';
import { apiSafe } from '../../lib/api';

export default async function SettingsPage() {
  const flags = await apiSafe<Record<string, boolean>>('/platform/flags', {});

  const settingsSections = [
    { title: 'Integrations', description: 'Configure external service integrations' },
    { title: 'Notifications', description: 'Alert routing and notification channels' },
    { title: 'API Keys', description: 'Manage API keys and service tokens' },
    { title: 'Webhooks', description: 'Configure outbound webhook endpoints' },
    { title: 'Monitoring Thresholds', description: 'Set alert thresholds for metrics' },
    { title: 'Environment Settings', description: 'Default environment configurations' },
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Settings' }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Settings</h1>
      <p className="text-sm text-gray-500 mb-8">Platform configuration — Super Admin: hello@askabd.com</p>

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {settingsSections.map(section => (
          <div key={section.title} className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-sm mb-1">{section.title}</h3>
            <p className="text-xs text-gray-500">{section.description}</p>
          </div>
        ))}
      </div>

      {/* Feature Toggles */}
      <section className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold text-lg mb-4">Feature Toggles</h2>
        <div className="grid md:grid-cols-2 gap-2">
          {Object.entries(flags).map(([key, enabled]) => (
            <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
              <span className="text-sm font-medium">{key}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {enabled ? 'ON' : 'OFF'}
              </span>
            </div>
          ))}
          {Object.keys(flags).length === 0 && (
            <p className="text-sm text-gray-400 col-span-2">Feature flags will appear when backend is connected.</p>
          )}
        </div>
      </section>
    </div>
  );
}
