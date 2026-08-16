import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Breadcrumb } from '../../components/breadcrumb';
import { generateMockDefects } from '../../lib/engineering-intelligence';
import { DefectDetailView } from './detail-view';

interface Props { params: Promise<{ defectId: string }> }

export default async function DefectDetailPage({ params }: Props) {
  const { defectId } = await params;
  const defects = generateMockDefects();
  const defect = defects.find(d => d.id === defectId);
  if (!defect) notFound();

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Engineering', href: '/engineering' },
        { label: defect.title },
      ]} />
      <DefectDetailView defect={defect} />
    </div>
  );
}
