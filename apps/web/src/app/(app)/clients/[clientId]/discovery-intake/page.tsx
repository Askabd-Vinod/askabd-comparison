import { apiSafe } from '../../../../lib/api';
import { DiscoveryIntakeManager, type DiscoverySource } from './discovery-intake-manager';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientDiscoveryIntakePage({ params }: PageProps) {
  const { clientId } = await params;

  // Real, database-backed free-text problem-statement intake (migration
  // 042, discovery-intake-service.ts) — the real upstream starting point
  // of the discovery journey (Part 8), distinct from the live
  // connector-based technical discovery on the Discovery page and from
  // already-classified Problem Universe records.
  const { sources } = await apiSafe<{ sources: DiscoverySource[] }>(`/api/v1/oc/clients/${clientId}/discovery-sources`, { sources: [] });

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Problem Statement Intake</h2>
      <p className="text-xs text-gray-500 mb-6">
        Capture the client's own description of a problem, in their own words — the real starting point of
        discovery. Staff can then tag real, evidence-quoted structured findings from the raw text; every
        extraction must be traceable back to an exact excerpt, never assumed.
      </p>
      <DiscoveryIntakeManager clientId={clientId} initialSources={sources} />
    </div>
  );
}
