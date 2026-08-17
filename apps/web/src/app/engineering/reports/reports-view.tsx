'use client';
import { DownloadButton } from '../../components/download-button';
import type { RealEngineeringMetrics } from '../../lib/real-engineering';
import { formatResolutionTime } from '../../lib/real-engineering';

// Only report types backed by real oc_defects data are offered. Report types with no
// real data source in this platform (architecture health, code quality/ESLint coverage,
// build/deploy success rates, technical debt inventory) were removed rather than shipped
// with fabricated content.
const reports = [
  { id: 'eng-defect', name: 'Defect Report', icon: '🐛', description: 'All tracked defects with category, severity, status, and occurrence count' },
  { id: 'eng-rca', name: 'Root Cause Report', icon: '🔍', description: 'Recorded root causes, confidence level (confirmed/likely/possible/unknown), and evidence' },
  { id: 'eng-security', name: 'Security Report', icon: '🔒', description: 'Open defects in the security category' },
  { id: 'eng-executive', name: 'Engineering Executive Summary', icon: '📈', description: 'Open/critical/recurring defect counts and average resolution time' },
];

export function EngineeringReportsView({ metrics }: { metrics: RealEngineeringMetrics }) {
  const lastSync = new Date().toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const reportData = {
    openDefects: metrics.openDefects,
    criticalOpen: metrics.criticalOpen,
    highOpen: metrics.highOpen,
    recurringIssues: metrics.recurringIssues,
    securityOpen: metrics.securityOpen,
    resolvedCount: metrics.resolvedCount,
    avgResolutionTime: formatResolutionTime(metrics.avgResolutionHours),
    confidenceDistribution: metrics.confidenceDistribution,
    topRootCauses: metrics.topRootCauses,
    mostImpactedServices: metrics.mostImpactedServices,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Engineering Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">{reports.length} report types, backed by real defect data • Downloadable in PDF, Excel, CSV, JSON</p>
        </div>
        <span className="text-[9px] text-gray-400">Generated: {lastSync}</span>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map(report => (
          <div key={report.id} className="bg-white rounded-xl border p-5 hover:shadow-md hover:border-purple-200 transition group">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{report.icon}</span>
              <h3 className="font-semibold text-sm group-hover:text-purple-700">{report.name}</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">{report.description}</p>
            <div className="flex flex-wrap gap-1.5">
              <DownloadButton fileName={report.name} format="pdf" entityId={report.id} entityName={report.name} data={{ ...reportData, reportType: report.id, generated: new Date().toISOString() }} />
              <DownloadButton fileName={report.name} format="excel" entityId={report.id} entityName={report.name} data={{ ...reportData, reportType: report.id }} />
              <DownloadButton fileName={report.name} format="csv" entityId={report.id} entityName={report.name} data={{ ...reportData, reportType: report.id }} />
              <DownloadButton fileName={report.name} format="csv" entityId={report.id} entityName={report.name} className="text-[10px] font-medium px-2 py-0.5 rounded bg-gray-50 text-gray-600 hover:bg-gray-100 cursor-pointer transition">
                JSON
              </DownloadButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
