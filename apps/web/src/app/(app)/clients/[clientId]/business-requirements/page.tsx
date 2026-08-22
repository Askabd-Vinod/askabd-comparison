import { apiSafe } from '../../../../lib/api';
import { BusinessRequirementsManager, type BusinessRequirement, type QualitySummary } from './business-requirements-manager';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientBusinessRequirementsPage({ params }: PageProps) {
  const { clientId } = await params;

  // Real, database-backed client business/functional/technical requirements
  // (migration 038, business-requirements-service.ts) — distinct from the
  // fixed AskABD onboarding-requirement catalog shown on the Lifecycle page.
  const { requirements } = await apiSafe<{ requirements: BusinessRequirement[] }>(`/api/v1/oc/clients/${clientId}/business-requirements`, { requirements: [] });
  const { summary } = await apiSafe<{ summary: QualitySummary }>(`/api/v1/oc/clients/${clientId}/business-requirements/summary`, {
    summary: { complete: 0, partially_complete: 0, incomplete: 0, ambiguous: 0, conflicting: 0, duplicate: 0, unverified: 0, total: 0 },
  });

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Business Requirements</h2>
      <p className="text-xs text-gray-500 mb-6">
        The client's own stated business, functional, and technical requirements — classified by a real,
        rule-based, explainable check (never a fabricated AI score). Every non-complete status shows exactly
        which rule fired and why.
      </p>
      <BusinessRequirementsManager clientId={clientId} initialRequirements={requirements} initialSummary={summary} />
    </div>
  );
}
