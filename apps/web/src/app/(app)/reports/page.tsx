import { mockClients } from '../../lib/mock-clients';
import { Breadcrumb } from '../../components/breadcrumb';
import { KpiCard } from '../../components/kpi-card';
import { ReportCards } from './report-cards';
import { DemoDataBanner } from '../../components/demo-data-banner';

export default function ReportsPage() {
  const clients = mockClients;
  const avgAvailability = +(clients.reduce((a, c) => a + c.monitoring.availability, 0) / clients.length).toFixed(2);
  const totalDeploys = clients.reduce((a, c) => a + c.deployments.length, 0);
  const totalIncidents = clients.reduce((a, c) => a + c.incidents.length, 0);
  const slaCompliant = clients.filter(c => c.slaStatus === 'compliant').length;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Reports' }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Reports</h1>
      <DemoDataBanner />

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <KpiCard label="Avg Availability" value={`${avgAvailability}%`} color="text-green-600" description="Average uptime percentage across all clients." criteria="Sum of all client availability / total clients. Target: ≥ 99.9%." />
        <KpiCard label="Total Deployments" value={totalDeploys} description="Total deployments across all clients and environments." criteria="Sum of all deployment records." />
        <KpiCard label="Total Incidents" value={totalIncidents} color="text-red-600" description="Total incident count (all statuses)." criteria="Sum of all incident records." />
        <KpiCard label="SLA Compliant" value={`${slaCompliant}/${clients.length}`} color="text-green-600" description="Clients meeting SLA commitments." criteria="Count where slaStatus = 'compliant'." />
      </div>

      {/* Report Cards with download buttons */}
      <ReportCards avgAvailability={avgAvailability} totalDeploys={totalDeploys} totalIncidents={totalIncidents} slaCompliant={slaCompliant} totalClients={clients.length} />
    </div>
  );
}
