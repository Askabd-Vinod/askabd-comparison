import { Breadcrumb } from '../../components/breadcrumb';
import { EngineeringReportsView } from './reports-view';

export default function EngineeringReportsPage() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Engineering', href: '/engineering' }, { label: 'Reports' }]} />
      <EngineeringReportsView />
    </div>
  );
}
