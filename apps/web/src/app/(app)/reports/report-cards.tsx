'use client';
import { DownloadButton } from '../../components/download-button';

const reportTypes = [
  { id: 'health', name: 'Health Report', icon: '💚', description: 'Platform health and uptime metrics', period: 'Monthly' },
  { id: 'availability', name: 'Availability Report', icon: '📊', description: 'Service availability and SLA adherence', period: 'Monthly' },
  { id: 'performance', name: 'Performance Report', icon: '🚀', description: 'Latency, throughput, resource usage', period: 'Monthly' },
  { id: 'incidents', name: 'Incident Report', icon: '🚨', description: 'Incident history and resolution metrics', period: 'Monthly' },
  { id: 'deployments', name: 'Deployment Report', icon: '📦', description: 'Deployment frequency and success rate', period: 'Monthly' },
  { id: 'security', name: 'Security Report', icon: '🔒', description: 'Vulnerability scans and compliance', period: 'Monthly' },
  { id: 'usage', name: 'Usage Report', icon: '📈', description: 'API calls, bandwidth, storage consumption', period: 'Monthly' },
  { id: 'sla', name: 'SLA Compliance Report', icon: '✅', description: 'SLA adherence across clients', period: 'Monthly' },
  { id: 'growth', name: 'Growth Report', icon: '📊', description: 'Client onboarding, service adoption trends', period: 'Quarterly' },
];

export function ReportCards({ avgAvailability, totalDeploys, totalIncidents, slaCompliant, totalClients }: { avgAvailability: number; totalDeploys: number; totalIncidents: number; slaCompliant: number; totalClients: number }) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {reportTypes.map(report => (
        <div key={report.id} className="bg-white rounded-xl border p-5 hover:shadow-md hover:border-purple-200 transition group">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{report.icon}</span>
              <h3 className="font-semibold text-sm group-hover:text-purple-700">{report.name}</h3>
            </div>
            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{report.period}</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">{report.description}</p>
          <div className="flex gap-2">
            <DownloadButton
              fileName={report.name}
              format="pdf"
              entityId={report.id}
              entityName={report.name}
              data={{ type: report.id, period: report.period, availability: avgAvailability, deployments: totalDeploys, incidents: totalIncidents, slaCompliant: `${slaCompliant}/${totalClients}` }}
            />
            <DownloadButton
              fileName={report.name}
              format="excel"
              entityId={report.id}
              entityName={report.name}
              data={{ type: report.id, period: report.period, availability: avgAvailability, deployments: totalDeploys, incidents: totalIncidents }}
            />
            <DownloadButton
              fileName={report.name}
              format="csv"
              entityId={report.id}
              entityName={report.name}
              data={{ type: report.id, availability: avgAvailability, deployments: totalDeploys, incidents: totalIncidents }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
