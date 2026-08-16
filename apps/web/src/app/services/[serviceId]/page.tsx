import { notFound } from 'next/navigation';
import Link from 'next/link';
import { platformServices, mockClients } from '../../lib/mock-clients';
import { Breadcrumb } from '../../components/breadcrumb';
import { statusColor } from '../../components/status-badge';

interface PageProps { params: Promise<{ serviceId: string }> }

export default async function ServiceDetailPage({ params }: PageProps) {
  const { serviceId } = await params;
  const service = platformServices.find(s => s.id === serviceId);
  if (!service) notFound();

  const clientsUsing = mockClients.filter(c =>
    c.activeServices.some(s => s.toLowerCase().includes(service.name.split(' ')[0].toLowerCase()))
  );

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Services', href: '/services' },
        { label: service.name },
      ]} />
      <div className="flex items-center gap-3 mb-6">
        <span className={`w-3 h-3 rounded-full ${statusColor(service.status)}`} />
        <h1 className="text-2xl font-bold text-gray-900">{service.name}</h1>
        <span className="text-sm text-gray-400">v{service.version}</span>
      </div>
      <p className="text-sm text-gray-600 mb-8">{service.description}</p>

      <section className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold">Clients Using This Service ({clientsUsing.length})</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {clientsUsing.map(c => (
            <Link key={c.id} href={`/clients/${c.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 gradient-brand rounded-md flex items-center justify-center">
                  <span className="text-white text-[10px] font-bold">{c.logo}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-[11px] text-gray-400">{c.industry}</p>
                </div>
              </div>
              <span className={`w-2 h-2 rounded-full ${statusColor(c.health)}`} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
