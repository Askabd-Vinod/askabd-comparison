import { apiSafe } from '../../../../lib/api';
import { TraceabilityManager } from './traceability-manager';
import type { BusinessRequirement } from '../business-requirements/business-requirements-manager';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientTraceabilityPage({ params }: PageProps) {
  const { clientId } = await params;

  // Real UI over the real Traceability Engine (migration 041,
  // traceability-engine.ts) — surfaces the actual chains this session's
  // prior work has been recording (Discovery -> Business Requirement ->
  // Gap -> Recommendation/Transformation -> Generated Document). Business
  // Requirements are the natural, real starting point (Part 8's own
  // BR-anchored chain), reusing the existing requirements list — no
  // parallel entity picker invented.
  const { requirements } = await apiSafe<{ requirements: BusinessRequirement[] }>(`/api/v1/oc/clients/${clientId}/business-requirements`, { requirements: [] });

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Traceability</h2>
      <p className="text-xs text-gray-500 mb-6">
        The real, recorded chain from a business requirement down to everything that derives from it —
        gaps, recommendations, transformations, generated documents — every hop a real link row, never an
        inferred or fabricated relationship. Pick a requirement below to see its real forward chain.
      </p>
      <TraceabilityManager clientId={clientId} requirements={requirements} />
    </div>
  );
}
