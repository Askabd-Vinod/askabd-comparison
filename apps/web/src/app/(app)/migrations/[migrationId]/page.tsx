import { notFound } from 'next/navigation';
import { Breadcrumb } from '../../../components/breadcrumb';
import { api, ApiError } from '../../../lib/api';
import type { MigrationRun } from '../../../lib/real-migration';
import { MigrationDetailView } from './detail-view';

interface Props { params: Promise<{ migrationId: string }> }

export default async function MigrationDetailPage({ params }: Props) {
  const { migrationId } = await params;

  let migration: MigrationRun;
  try {
    const res = await api<{ migration: MigrationRun }>(`/api/v1/oc/migrations/${migrationId}`);
    migration = res.migration;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const clientRes = await api<{ client: { name: string } }>(`/api/v1/oc/clients/${migration.clientId}`).catch(() => null);
  const clientName = clientRes?.client?.name || migration.clientId;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Migrations', href: '/migrations' },
        { label: `${migration.sourceSchema} → ${migration.targetSchema}` },
      ]} />
      <MigrationDetailView migration={migration} clientName={clientName} />
    </div>
  );
}
