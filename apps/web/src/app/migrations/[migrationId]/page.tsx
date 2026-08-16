import { notFound } from 'next/navigation';
import { Breadcrumb } from '../../components/breadcrumb';
import { generateMockMigrations } from '../../lib/migration-intelligence';
import { MigrationDetailView } from './detail-view';

interface Props { params: Promise<{ migrationId: string }> }

export default async function MigrationDetailPage({ params }: Props) {
  const { migrationId } = await params;
  const migrations = generateMockMigrations();
  const migration = migrations.find(m => m.id === migrationId);
  if (!migration) notFound();

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Migrations', href: '/migrations' },
        { label: migration.name },
      ]} />
      <MigrationDetailView migration={migration} />
    </div>
  );
}
