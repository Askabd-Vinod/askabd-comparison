import { apiSafe } from '../../../../lib/api';
import { NotesManager, type ClientNote } from './notes-manager';

interface PageProps { params: Promise<{ clientId: string }> }

/**
 * Real, database-backed client notes (migration 030, crm-service.ts) —
 * previously did not exist at all as a capability. Staff-authored, staff-only
 * for now — see docs/crm-completeness.md for the real, undecided question of
 * customer-portal visibility of this data.
 */
export default async function ClientNotesPage({ params }: PageProps) {
  const { clientId } = await params;
  const { notes } = await apiSafe<{ notes: ClientNote[] }>(`/api/v1/oc/clients/${clientId}/notes`, { notes: [] });

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Notes</h2>
      <p className="text-xs text-gray-500 mb-6">Real, timestamped, staff-authored notes about this client relationship.</p>
      <NotesManager clientId={clientId} initialNotes={notes} />
    </div>
  );
}
