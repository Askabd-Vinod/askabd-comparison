import Link from 'next/link';
import { platformServices } from '../../lib/mock-clients';
import { Breadcrumb } from '../../components/breadcrumb';
import { statusColor } from '../../components/status-badge';
import { ServiceControlsInline } from '../../components/service-controls';
import { DemoDataBanner } from '../../components/demo-data-banner';

export default function ServicesPage() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Services' }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Platform Services</h1>
      {/* Every status/version/clientCount below is static demo content
          (mock-clients.ts's platformServices), not measured platform state —
          found during the 2026-08-29 mock/demo data audit. The detail page
          (services/[serviceId]) already discloses this; this list page did
          not, an inconsistency now fixed to match. The real, live service
          registry is at /platform/services (GET /oc/platform/services). */}
      <DemoDataBanner />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {platformServices.map(svc => (
          <div
            key={svc.id}
            className="bg-white rounded-xl border p-5 hover:shadow-md hover:border-purple-200 transition group relative"
          >
            <div className="flex items-center justify-between mb-3">
              <Link href={`/services/${svc.id}`} className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${statusColor(svc.status)}`} />
                <h3 className="font-semibold text-sm group-hover:text-purple-700">{svc.name}</h3>
              </Link>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">v{svc.version}</span>
                <ServiceControlsInline entityId={svc.id} entityName={svc.name} entityType="service" initialEnabled={svc.status !== 'offline'} />
              </div>
            </div>
            <Link href={`/services/${svc.id}`}>
              <p className="text-xs text-gray-500 mb-3">{svc.description}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{svc.clientCount} clients</span>
                <span className={`capitalize ${svc.status === 'healthy' ? 'text-green-600' : 'text-orange-600'}`}>{svc.status}</span>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
