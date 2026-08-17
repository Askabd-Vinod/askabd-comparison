import Link from 'next/link';
import { apiSafe } from '../../../lib/api';
import { ConnectorGrid } from './connector-grid';

interface PageProps { params: Promise<{ clientId: string }> }

interface RelevantConnector {
  connectorId: string; connectorName: string; category: string;
  classification: 'required' | 'optional';
  requiredBy: Array<{ capabilityId: string; capabilityName: string }>;
  status: string; lastTestedAt: string | null;
}
interface OnboardingRequirements {
  services: Array<{ capabilityId: string; capabilityName: string }>;
  relevantConnectors: RelevantConnector[];
  hiddenConnectorCount: number;
}

export default async function ClientConnectorsPage({ params }: PageProps) {
  const { clientId } = await params;
  // Authoritative connector state — GET /oc/connectors/:clientId (oc_connectors table),
  // written only by ConnectorService.testConnection / saveConfiguration.
  const { connectors } = await apiSafe<{ connectors: any[] }>(`/api/v1/oc/connectors/${clientId}`, { connectors: [] });
  // Service-driven relevance — GET /oc/clients/:clientId/onboarding/requirements, derived
  // from this client's explicitly enabled services (oc_client_services), never a guess.
  const onboarding = await apiSafe<OnboardingRequirements>(`/api/v1/oc/clients/${clientId}/onboarding/requirements`, { services: [], relevantConnectors: [], hiddenConnectorCount: 33 });

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Connectors</h2>
      <p className="text-xs text-gray-500 mb-6">A connector is marked "Connected" only after a real connection test has passed.</p>

      {onboarding.services.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
          <p className="text-sm font-medium text-blue-800">No services selected for this client yet</p>
          <p className="text-xs text-blue-700 mt-1">AskABD only asks for the connections a client's selected services actually need. Select services on the <Link href={`/clients/${clientId}/services`} className="underline font-medium">Services page</Link> first, and this page will show exactly what's needed for them.</p>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
          <p className="text-xs font-medium text-green-800">Based on {onboarding.services.length} selected service{onboarding.services.length === 1 ? '' : 's'} ({onboarding.services.map(s => s.capabilityName).join(', ')}), {onboarding.relevantConnectors.length} connector{onboarding.relevantConnectors.length === 1 ? ' is' : 's are'} relevant. {onboarding.hiddenConnectorCount} others are hidden below as not required.</p>
        </div>
      )}

      <ConnectorGrid clientId={clientId} connectors={connectors} relevantConnectors={onboarding.relevantConnectors} />
    </div>
  );
}
