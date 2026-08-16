import { CapabilityPlaceholder } from '../capability-placeholder';
import { mockClients } from '../../../lib/mock-clients';
import { UsageView } from './usage-view';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientUsagePage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Usage" description="Usage management for this client." />;
  const m = client.monitoring;

  const daily = {
    apiCalls: m.traffic * 60 * 24,
    transactions: Math.round(m.traffic * 0.3 * 60 * 24),
    users: Math.round(m.connections * 2.5),
    sessions: Math.round(m.connections * 4),
    bandwidth: m.bandwidth * 3600 * 24,
    storage: client.infrastructure.diskUsed,
  };

  const weekly = { apiCalls: daily.apiCalls * 7, transactions: daily.transactions * 7, users: Math.round(daily.users * 1.5), sessions: daily.sessions * 7, bandwidth: daily.bandwidth * 7, storage: daily.storage };
  const monthly = { apiCalls: daily.apiCalls * 30, transactions: daily.transactions * 30, users: Math.round(daily.users * 2), sessions: daily.sessions * 30, bandwidth: daily.bandwidth * 30, storage: daily.storage };

  return <UsageView daily={daily} weekly={weekly} monthly={monthly} clientName={client.name} clientId={clientId} />;
}
