import { apiSafe } from '../../../../lib/api';
import { ComparisonsManager, type ComparisonRun, type ConfigurationSnapshot } from './comparisons-manager';
import type { DatabaseConnection } from '../../../../components/database-connections-manager';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientComparisonsPage({ params }: PageProps) {
  const { clientId } = await params;

  // Real, database-backed Universal Comparison Engine (migration 048,
  // universal-comparison-engine.ts) — compares two of this client's own
  // real database connections (from the Lifecycle tab's Database
  // Connections manager) at the schema/table level, OR two real,
  // staff-entered Configuration Snapshots (migration 052) at the
  // key-value level — the same engine, a second real comparison type,
  // not a duplicate.
  const { runs } = await apiSafe<{ runs: ComparisonRun[] }>(`/api/v1/oc/clients/${clientId}/comparisons`, { runs: [] });
  const { connections } = await apiSafe<{ connections: DatabaseConnection[] }>(`/api/v1/oc/clients/${clientId}/database-connections`, { connections: [] });
  // Real capability negotiation (Technology Adapter Registry, migration 051)
  // — which connector types this platform can actually compare, fetched
  // live rather than hard-coded, so the UI stays honest as real adapters
  // are added. Empty on fetch failure — the manager treats an unknown
  // technology as unsupported, never silently offering it.
  const { adapters } = await apiSafe<{ adapters: Array<{ technology: string; status: string }> }>(`/api/v1/oc/technology-adapters?category=database`, { adapters: [] });
  const { snapshots } = await apiSafe<{ snapshots: ConfigurationSnapshot[] }>(`/api/v1/oc/clients/${clientId}/configuration-snapshots`, { snapshots: [] });

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Comparisons</h2>
      <p className="text-xs text-gray-500 mb-6">
        Real, read-only comparisons between two of this client's own database connections (schema/table level) or
        configuration snapshots (key-value level) — never a fabricated diff. v1 compares PostgreSQL table
        inventories and manually-entered configuration only; other database technologies show an honest "Adapter
        Required" status rather than being silently hidden or attempted blind.
      </p>
      <ComparisonsManager clientId={clientId} initialRuns={runs} connections={connections} adapters={adapters} initialSnapshots={snapshots} />
    </div>
  );
}
