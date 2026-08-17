import { notFound } from 'next/navigation';
import { Breadcrumb } from '../../components/breadcrumb';
import { api, ApiError } from '../../lib/api';
import type { RealDefect } from '../../lib/real-engineering';
import { DefectDetailView } from './detail-view';

interface Props { params: Promise<{ defectId: string }> }

export default async function DefectDetailPage({ params }: Props) {
  const { defectId } = await params;

  let defect: RealDefect;
  try {
    const res = await api<{ defect: RealDefect }>(`/api/v1/oc/defects/${defectId}`);
    defect = res.defect;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  let clientName: string | null = null;
  if (defect.client_id) {
    const res = await api<{ client: { name: string } }>(`/api/v1/oc/clients/${defect.client_id}`).catch(() => null);
    clientName = res?.client?.name || null;
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Engineering', href: '/engineering' },
        { label: defect.title },
      ]} />
      <DefectDetailView defect={defect} clientName={clientName} />
    </div>
  );
}
