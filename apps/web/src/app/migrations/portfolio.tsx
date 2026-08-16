'use client';
import Link from 'next/link';
import type { MigrationProgram } from '../lib/migration-intelligence';
import { DownloadButton } from '../components/download-button';

const statusColors: Record<string, string> = {
  planning: 'bg-gray-100 text-gray-700', assessing: 'bg-blue-100 text-blue-700', ready: 'bg-green-100 text-green-700',
  'in-progress': 'bg-purple-100 text-purple-700', validating: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-200 text-green-800', 'rolled-back': 'bg-orange-100 text-orange-700',
  paused: 'bg-yellow-100 text-yellow-700', cancelled: 'bg-red-100 text-red-700',
};

const riskColors: Record<string, string> = { critical: 'text-red-600', high: 'text-orange-600', medium: 'text-yellow-600', low: 'text-green-600' };

export function MigrationPortfolio({ migrations }: { migrations: MigrationProgram[] }) {
  return (
    <section id="portfolio" className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Migration Portfolio</h2>
        <div className="flex items-center gap-2">
          <DownloadButton fileName="Migration_Portfolio_Report" format="pdf" entityId="portfolio" entityName="Migration Portfolio" data={{ totalPrograms: migrations.length, avgProgress: Math.round(migrations.reduce((a, m) => a + m.progress, 0) / migrations.length) }}>
            Export Report
          </DownloadButton>
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {migrations.map(m => (
          <Link key={m.id} href={`/migrations/${m.id}`} className="block px-6 py-4 hover:bg-gray-50 transition">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white text-xs font-bold">{m.type.substring(0, 2).toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{m.name}</p>
                  <p className="text-[10px] text-gray-500">{m.clientName} • {m.type.replace(/-/g, ' ')} • {m.phase}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${statusColors[m.status]}`}>{m.status.replace('-', ' ')}</span>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{m.progress}%</p>
                  <p className="text-[9px] text-gray-400">progress</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6 text-[10px] text-gray-500">
              <span>Readiness: <span className={`font-bold ${m.readinessScore >= 70 ? 'text-green-600' : 'text-orange-600'}`}>{m.readinessScore}%</span></span>
              <span>Risk: <span className={`font-bold ${m.riskScore > 50 ? 'text-red-600' : m.riskScore > 30 ? 'text-orange-600' : 'text-green-600'}`}>{m.riskScore}/100</span></span>
              <span>Confidence: <span className="font-bold">{m.confidenceScore}%</span></span>
              <span>Waves: {m.waves.length}</span>
              <span>Gaps: {m.gaps.filter(g => g.status === 'open').length} open</span>
              <span>Timeline: {m.assessment.timeline}</span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${m.progress >= 80 ? 'bg-green-500' : m.progress >= 40 ? 'bg-purple-500' : 'bg-blue-500'}`} style={{ width: `${m.progress}%` }} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
