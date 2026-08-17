'use client';
import Link from 'next/link';
import type { MigrationRun } from '../lib/real-migration';
import { statusColors, formatDuration } from '../lib/real-migration';
import { DownloadButton } from '../components/download-button';

export function MigrationPortfolio({ migrations, clientNameById }: { migrations: MigrationRun[]; clientNameById: Record<string, string> }) {
  return (
    <section id="portfolio" className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Migration Runs</h2>
        <div className="flex items-center gap-2">
          {migrations.length > 0 && (
            <DownloadButton fileName="Migration_Portfolio_Report" format="pdf" entityId="portfolio" entityName="Migration Portfolio" data={{ totalRuns: migrations.length, byStatus: migrations.reduce((acc: Record<string, number>, m) => { acc[m.status] = (acc[m.status] || 0) + 1; return acc; }, {}) }}>
              Export Report
            </DownloadButton>
          )}
        </div>
      </div>
      {migrations.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-gray-500">No migration runs yet.</p>
          <Link href="/migrations/new" className="inline-block mt-2 text-xs font-medium text-purple-600 hover:text-purple-800">+ Create a migration plan →</Link>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {migrations.map(m => (
            <Link key={m.id} href={`/migrations/${m.id}`} className="block px-6 py-4 hover:bg-gray-50 transition">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-xs font-bold">DB</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{m.sourceSchema} → {m.targetSchema}</p>
                    <p className="text-[10px] text-gray-500">Client: {clientNameById[m.clientId] || m.clientId} • Created {new Date(m.createdAt).toLocaleDateString('en-AU')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${statusColors[m.status] || 'bg-gray-100 text-gray-600'}`}>{m.status.replace('-', ' ')}</span>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{m.progress?.percentage ?? 0}%</p>
                    <p className="text-[9px] text-gray-400">mandatory steps</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6 text-[10px] text-gray-500">
                <span>Tables: <span className="font-bold">{m.plan?.tables ?? 0}</span></span>
                <span>Mandatory steps: <span className="font-bold">{m.progress?.mandatoryCompleted ?? 0}/{m.progress?.mandatory ?? 0}</span></span>
                <span>Failed: <span className={`font-bold ${(m.progress?.failed ?? 0) > 0 ? 'text-red-600' : ''}`}>{m.progress?.failed ?? 0}</span></span>
                <span>Duration: {formatDuration(m.durationMs)}</span>
              </div>
              <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${m.status === 'completed' || m.status === 'validated' ? 'bg-green-500' : m.status === 'failed' ? 'bg-red-500' : 'bg-purple-500'}`} style={{ width: `${m.progress?.percentage ?? 0}%` }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
