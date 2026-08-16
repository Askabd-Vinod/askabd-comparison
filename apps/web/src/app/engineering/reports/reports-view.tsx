'use client';
import { DownloadButton } from '../../components/download-button';
import { generateMockMetrics } from '../../lib/engineering-intelligence';

const reports = [
  { id: 'eng-health', name: 'Engineering Health Report', icon: '💚', description: 'Overall engineering health, build/deploy rates, code quality metrics' },
  { id: 'eng-dashboard', name: 'Engineering Dashboard Report', icon: '📊', description: 'Full dashboard snapshot with all KPIs and trends' },
  { id: 'eng-defect', name: 'Defect Report', icon: '🐛', description: 'All active and resolved defects with status, severity, and owner' },
  { id: 'eng-rca', name: 'Root Cause Report', icon: '🔍', description: 'Root cause analysis results, confidence scores, and evidence' },
  { id: 'eng-architecture', name: 'Architecture Report', icon: '🏗️', description: 'Architecture health, violations, and improvement recommendations' },
  { id: 'eng-techdebt', name: 'Technical Debt Report', icon: '📋', description: 'Technical debt inventory, priority, and remediation plan' },
  { id: 'eng-codequality', name: 'Code Quality Report', icon: '✨', description: 'TypeScript coverage, ESLint violations, anti-patterns detected' },
  { id: 'eng-security', name: 'Security Report', icon: '🔒', description: 'Security findings, vulnerability scan results, compliance status' },
  { id: 'eng-validation', name: 'Validation Report', icon: '✅', description: 'Fix validation results, regression test outcomes, success criteria' },
  { id: 'eng-regression', name: 'Regression Report', icon: '🔄', description: 'Regression test results after fixes applied' },
  { id: 'eng-executive', name: 'Engineering Executive Report', icon: '📈', description: 'Executive summary for stakeholders — business impact and resolution' },
];

export function EngineeringReportsView() {
  const metrics = generateMockMetrics();
  const lastSync = new Date().toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Engineering Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">{reports.length} report types • Downloadable in PDF, Excel, CSV, JSON</p>
        </div>
        <span className="text-[9px] text-gray-400">Last sync: {lastSync}</span>
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
              <DownloadButton fileName={report.name} format="pdf" entityId={report.id} entityName={report.name} data={{ ...metrics, reportType: report.id, generated: new Date().toISOString() }} />
              <DownloadButton fileName={report.name} format="excel" entityId={report.id} entityName={report.name} data={{ ...metrics, reportType: report.id }} />
              <DownloadButton fileName={report.name} format="csv" entityId={report.id} entityName={report.name} data={{ ...metrics, reportType: report.id }} />
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
