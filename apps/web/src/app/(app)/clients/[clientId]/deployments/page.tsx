import { apiSafe } from '../../../../lib/api';
import { DeploymentGrid } from './deployment-grid';

interface PageProps { params: Promise<{ clientId: string }> }

interface Deployment {
  id: string; environment: string; application: string; version: string; previousVersion: string | null;
  status: string; risk: string; requestedBy: string | null; plannedStart: string | null;
  actualStart: string | null; actualCompletion: string | null; createdAt: string;
}

/**
 * Real Deployment Engine list — replaces the fully fabricated version of
 * this page (read `client.deployments` from `mockClients`, ~20 static demo
 * entries only, real clients silently fell to CapabilityPlaceholder). See
 * `docs/eoc-feature-coverage-matrix.md` row #52's 2026-08-24 correction and
 * `docs/evidence/deployment_validation/deployment_validation_test_1/` for
 * the full write-up. Every value below is server-authoritative — fetched
 * from `GET /oc/clients/:clientId/deployments`, never fabricated.
 */
export default async function ClientDeploymentsPage({ params }: PageProps) {
  const { clientId } = await params;
  const { deployments } = await apiSafe<{ deployments: Deployment[] }>(`/api/v1/oc/clients/${clientId}/deployments`, { deployments: [] });

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Deployments</h2>
      <p className="text-xs text-gray-500 mb-6">Real deployment records for this client — gated on release readiness and a real approval decision before execution; validated post-deployment via real, evidence-enforced checks.</p>
      <DeploymentGrid clientId={clientId} initialDeployments={deployments} />
    </div>
  );
}
