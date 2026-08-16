import { CapabilityPlaceholder } from '../capability-placeholder';
import { mockClients } from '../../../lib/mock-clients';
import { serviceCatalog } from '../../../lib/service-catalog';
import { ContractsView } from './contracts-view';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientContractsPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Contracts" description="Contracts management for this client." />;

  const contracts = [
    { id: 'con-1', type: 'MSA', title: 'Master Service Agreement', status: 'active', start: '2026-01-01', expiry: '2027-12-31', value: 'Enterprise', version: '2.0', owner: 'hello@askabd.com', basis: 'Annual engagement — covers all platform services and support tiers.' },
    { id: 'con-2', type: 'SOW', title: 'Platform Operations SOW', status: 'active', start: '2026-01-01', expiry: '2026-12-31', value: '$180,000/year', version: '1.3', owner: 'hello@askabd.com', basis: 'Scope: 24/7 monitoring, incident management, deployments. Based on 8 applications, 3 environments.' },
    { id: 'con-3', type: 'SLA', title: 'Service Level Agreement', status: 'active', start: '2026-01-01', expiry: '2026-12-31', value: '99.9% uptime', version: '1.1', owner: 'ops@askabd.com', basis: 'Uptime SLA: 99.9%. MTTR target: < 30min for P1. Penalties: 5% credit per 0.1% below target.' },
    { id: 'con-4', type: 'NDA', title: 'Non-Disclosure Agreement', status: 'active', start: '2025-06-01', expiry: '2028-06-01', value: 'Mutual', version: '1.0', owner: 'hello@askabd.com', basis: 'Standard mutual NDA. 3-year term. Covers all shared information during engagement.' },
    { id: 'con-5', type: 'Support', title: 'Support Agreement', status: 'active', start: '2026-01-01', expiry: '2026-12-31', value: '24/7 L1-L3', version: '1.2', owner: 'ops@askabd.com', basis: 'L1-L3 support coverage. Business hours + on-call for critical. Includes 40 hours/month proactive.' },
  ];

  return <ContractsView contracts={contracts} client={client} serviceCatalog={serviceCatalog} />;
}
