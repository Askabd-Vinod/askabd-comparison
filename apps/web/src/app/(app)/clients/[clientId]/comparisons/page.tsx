import { apiSafe } from '../../../../lib/api';
import { ComparisonsManager, type ComparisonRun } from './comparisons-manager';
import type { DatabaseConnection } from '../../../../components/database-connections-manager';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientComparisonsPage({ params }: PageProps) {
  const { clientId } = await params;

  // Real, database-backed Universal Comparison Engine (migration 048,
  // universal-comparison-engine.ts) — compares two of this client's own
  // real database connections (from the Lifecycle tab's Database
  // Connections manager) at the schema/table level. Backend-only capability
  // so far; this is its first real UI.
  const { runs } = await apiSafe<{ runs: ComparisonRun[] }>(`/api/v1/oc/clients/${clientId}/comparisons`, { runs: [] });
  const { connections } = await apiSafe<{ connections: DatabaseConnection[] }>(`/api/v1/oc/clients/${clientId}/database-connections`, { connections: [] });

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Comparisons</h2>
      <p className="text-xs text-gray-500 mb-6">
        Real, read-only schema comparisons between two of this client's own database connections — never a
        fabricated diff. v1 compares PostgreSQL table inventories only; other comparison types (API, config,
        infrastructure) are a real, deliberate fast-follow, not yet built.
      </p>
      <ComparisonsManager clientId={clientId} initialRuns={runs} connections={connections} />
    </div>
  );
}
