import { apiSafe } from '../../../../lib/api';
import { TasksManager, type ClientTask } from './tasks-manager';

interface PageProps { params: Promise<{ clientId: string }> }

/**
 * Real, database-backed client tasks (migration 030, crm-service.ts) —
 * previously did not exist at all as a capability. Staff-assigned, staff-only
 * for now — see docs/crm-completeness.md.
 */
export default async function ClientTasksPage({ params }: PageProps) {
  const { clientId } = await params;
  const { tasks } = await apiSafe<{ tasks: ClientTask[] }>(`/api/v1/oc/clients/${clientId}/tasks`, { tasks: [] });

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Tasks</h2>
      <p className="text-xs text-gray-500 mb-6">Real, tracked follow-up tasks for this client relationship.</p>
      <TasksManager clientId={clientId} initialTasks={tasks} />
    </div>
  );
}
