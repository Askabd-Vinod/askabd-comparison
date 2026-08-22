'use client';
import { useState } from 'react';
import { KpiCard } from '../../../../components/kpi-card';
import { DownloadButton } from '../../../../components/download-button';

type Period = 'daily' | 'weekly' | 'monthly';

interface UsageData {
  apiCalls: number;
  transactions: number;
  users: number;
  sessions: number;
  bandwidth: number;
  storage: number;
}

export function UsageView({ daily, weekly, monthly, clientName, clientId }: { daily: UsageData; weekly: UsageData; monthly: UsageData; clientName: string; clientId: string }) {
  const [period, setPeriod] = useState<Period>('daily');

  const data: Record<Period, UsageData> = { daily, weekly, monthly };
  const current = data[period];
  const periodLabel: Record<Period, string> = { daily: 'per day', weekly: 'per week', monthly: 'per month' };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">Usage</h2>
        <DownloadButton fileName={`${clientName}_Usage_Report_${period}`} format="csv" entityId={clientId} entityName="Usage Report" clientName={clientName} data={{ period, apiCalls: current.apiCalls, transactions: current.transactions, users: current.users, sessions: current.sessions, bandwidth: current.bandwidth, storage: current.storage }}>
          Download Report
        </DownloadButton>
      </div>

      {/* Period Tabs — Interactive */}
      <div className="flex gap-2 mb-6">
        {(['daily', 'weekly', 'monthly'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)} className={`text-xs font-medium px-3 py-1.5 rounded-lg transition ${period === p ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Usage Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <KpiCard label="API Calls" value={fmtNum(current.apiCalls)} sub={periodLabel[period]} description="Total API requests processed." criteria={`Measured ${period}. Based on traffic metrics.`} />
        <KpiCard label="Transactions" value={fmtNum(current.transactions)} sub={periodLabel[period]} description="Business transactions completed." criteria="~30% of total API calls result in transactions." />
        <KpiCard label="Active Users" value={fmtNum(current.users)} sub={period === 'daily' ? 'today' : periodLabel[period]} description="Unique users accessing the platform." criteria="Based on active connections × multiplier." />
        <KpiCard label="Sessions" value={fmtNum(current.sessions)} sub={period === 'daily' ? 'today' : periodLabel[period]} description="Total user sessions opened." criteria="Based on connection count × session multiplier." />
        <KpiCard label="Bandwidth" value={`${fmtNum(Math.round(current.bandwidth / 1024))} GB`} sub={periodLabel[period]} description="Total data transferred." criteria="Sum of all network traffic in/out." />
        <KpiCard label="Storage" value={`${current.storage} GB`} sub="total" description="Total disk storage consumed." criteria="Current disk usage across all environments." />
      </div>

      {/* Comparison Table */}
      <section className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">Usage Comparison</h3>
          <DownloadButton fileName={`${clientName}_Usage_Comparison`} format="excel" entityId={clientId} entityName="Usage Comparison" clientName={clientName} data={{ dailyAPI: daily.apiCalls, weeklyAPI: weekly.apiCalls, monthlyAPI: monthly.apiCalls }}>
            Export
          </DownloadButton>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-5 py-3">Metric</th>
                <th className={`text-right px-4 py-3 ${period === 'daily' ? 'bg-purple-50 text-purple-700' : ''}`}>Daily</th>
                <th className={`text-right px-4 py-3 ${period === 'weekly' ? 'bg-purple-50 text-purple-700' : ''}`}>Weekly</th>
                <th className={`text-right px-4 py-3 ${period === 'monthly' ? 'bg-purple-50 text-purple-700' : ''}`}>Monthly</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <UsageRow label="API Calls" daily={daily.apiCalls} weekly={weekly.apiCalls} monthly={monthly.apiCalls} active={period} />
              <UsageRow label="Transactions" daily={daily.transactions} weekly={weekly.transactions} monthly={monthly.transactions} active={period} />
              <UsageRow label="Active Users" daily={daily.users} weekly={weekly.users} monthly={monthly.users} active={period} />
              <UsageRow label="Sessions" daily={daily.sessions} weekly={weekly.sessions} monthly={monthly.sessions} active={period} />
              <UsageRow label="Bandwidth (GB)" daily={Math.round(daily.bandwidth / 1024)} weekly={Math.round(weekly.bandwidth / 1024)} monthly={Math.round(monthly.bandwidth / 1024)} active={period} />
              <UsageRow label="Storage (GB)" daily={daily.storage} weekly={weekly.storage} monthly={monthly.storage} active={period} />
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function UsageRow({ label, daily, weekly, monthly, active }: { label: string; daily: number; weekly: number; monthly: number; active: Period }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-5 py-3 font-medium">{label}</td>
      <td className={`px-4 py-3 text-right font-mono text-xs ${active === 'daily' ? 'bg-purple-50/50 font-bold text-purple-700' : ''}`}>{fmtNum(daily)}</td>
      <td className={`px-4 py-3 text-right font-mono text-xs ${active === 'weekly' ? 'bg-purple-50/50 font-bold text-purple-700' : ''}`}>{fmtNum(weekly)}</td>
      <td className={`px-4 py-3 text-right font-mono text-xs ${active === 'monthly' ? 'bg-purple-50/50 font-bold text-purple-700' : ''}`}>{fmtNum(monthly)}</td>
    </tr>
  );
}

function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
