import { mockClients } from '../../lib/mock-clients';
import { Breadcrumb } from '../../components/breadcrumb';
import { StatusBadge, SLABadge } from '../../components/status-badge';
import { ClientTabs } from './client-tabs';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}

export default async function ClientLayout({ children, params }: LayoutProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);

  // If client is not in mock data, render a minimal layout
  // (dynamically onboarded clients are stored in localStorage, not accessible server-side)
  if (!client) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
        <Breadcrumb items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Clients', href: '/clients' },
          { label: clientId },
        ]} />
        <ClientTabs clientId={clientId} />
        <div className="mt-6">{children}</div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Clients', href: '/clients' },
        { label: client.name },
      ]} />

      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 gradient-brand rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-lg">{client.logo}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{client.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-gray-500">{client.industry}</span>
              <StatusBadge status={client.health} />
              <SLABadge status={client.slaStatus} />
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold gradient-text">{client.platformScore}</p>
          <p className="text-[10px] text-gray-400">Platform Score</p>
        </div>
      </div>

      <ClientTabs clientId={clientId} />

      <div className="mt-6">{children}</div>
    </div>
  );
}
