import { NotYetAvailable } from '../../../../components/not-yet-available';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientIncidentsPage({ params }: PageProps) {
  await params;

  // Per-client incident tracking has no real backend data source yet — see
  // docs/real-data-integrity-register.md. Platform-level incidents ARE real
  // (see /platform/incidents), so link there rather than fabricating client-scoped ones.
  return (
    <div>
      <h2 className="font-semibold text-lg mb-4">Incidents</h2>
      <NotYetAvailable
        title="Client-level incident tracking is not yet connected"
        description="AskABD tracks platform-wide incidents today, but per-client incident association is not yet implemented. This is not the same as 'no incidents' — the capability itself doesn't exist yet."
        alternateHref="/platform/incidents"
        alternateLabel="View Platform Incidents →"
      />
    </div>
  );
}
