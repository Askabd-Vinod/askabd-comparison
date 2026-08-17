import { Breadcrumb } from '../../components/breadcrumb';
import { apiSafe } from '../../lib/api';
import { computeRealMetrics, type RealDefect } from '../../lib/real-engineering';
import { EngineeringReportsView } from './reports-view';

export default async function EngineeringReportsPage() {
  const { defects } = await apiSafe<{ defects: RealDefect[] }>('/api/v1/oc/defects', { defects: [] });
  const metrics = computeRealMetrics(defects);

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Engineering', href: '/engineering' }, { label: 'Reports' }]} />
      <EngineeringReportsView metrics={metrics} />
    </div>
  );
}
