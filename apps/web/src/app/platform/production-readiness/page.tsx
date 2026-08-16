'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface PreflightItem {
  id: string;
  category: string;
  name: string;
  required: boolean;
  status: string;
  whatWeHave: string;
  whatIsMissing: string;
  whyRequired: string;
  businessImpact: string;
  securityImpact: string;
  howToConfigure: string;
  owner: string;
  isSecret: boolean;
  blocking: boolean;
  blockingReason?: string;
  nextAction: string;
}

interface PreflightReport {
  overallStatus: string;
  score: number;
  timestamp: string;
  environment: string;
  blockingItems: PreflightItem[];
  requiredItems: PreflightItem[];
  verifiedItems: PreflightItem[];
  optionalItems: PreflightItem[];
  missingInformation: PreflightItem[];
  securityIssues: PreflightItem[];
  warnings: string[];
  summary: { total: number; verified: number; ready: number; missing: number; optional: number; blocking: number };
}

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  verified: { bg: 'bg-green-50 border-green-200', text: 'text-green-800', label: '🟢 VERIFIED' },
  ready_to_connect: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', label: '🔵 READY TO CONNECT' },
  required: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-800', label: '🟡 REQUIRED' },
  missing: { bg: 'bg-red-50 border-red-200', text: 'text-red-800', label: '🔴 MISSING' },
  not_configured: { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-600', label: '⚪ NOT CONFIGURED' },
  optional: { bg: 'bg-gray-50 border-gray-100', text: 'text-gray-500', label: '⚫ OPTIONAL' },
  blocked: { bg: 'bg-red-50 border-red-300', text: 'text-red-900', label: '🔴 BLOCKED' },
  failed: { bg: 'bg-red-100 border-red-300', text: 'text-red-900', label: '❌ FAILED' },
};

function getStyle(status: string) { return statusStyles[status] || statusStyles.not_configured; }

export default function ProductionReadinessPage() {
  const [report, setReport] = useState<PreflightReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadPreflight = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/platform/production/preflight`);
      if (res.ok) setReport(await res.json());
    } catch { /* API unavailable */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadPreflight(); }, [loadPreflight]);

  if (loading) return <div className="p-8 text-gray-500 animate-pulse">Running production preflight checks...</div>;
  if (!report) return <div className="p-8 text-red-600">Unable to reach API for preflight validation.</div>;

  const overallColor = report.overallStatus === 'production_ready' ? 'bg-green-50 border-green-200' :
    report.overallStatus === 'application_ready' ? 'bg-blue-50 border-blue-200' : 'bg-yellow-50 border-yellow-200';

  const overallLabel = report.overallStatus === 'production_ready' ? '🟢 PRODUCTION READY' :
    report.overallStatus === 'staging_ready' ? '🔵 STAGING READY' :
    report.overallStatus === 'application_ready' ? '🔵 APPLICATION READY' : '🟡 CONNECTIONS PENDING';

  const allItems = [...report.blockingItems, ...report.requiredItems, ...report.verifiedItems, ...report.optionalItems];

  function renderItem(item: PreflightItem) {
    const style = getStyle(item.status);
    const isExpanded = expanded === item.id;
    return (
      <div key={item.id} className={`border rounded-lg p-4 transition cursor-pointer hover:shadow-sm ${style.bg}`}
        onClick={() => setExpanded(isExpanded ? null : item.id)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${style.text}`}>{style.label}</span>
            <span className="font-medium text-sm">{item.name}</span>
            <span className="text-xs text-gray-400">{item.category}</span>
          </div>
          <div className="flex items-center gap-2">
            {item.blocking && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">BLOCKS PRODUCTION</span>}
            <span className="text-xs text-gray-400">{item.owner}</span>
          </div>
        </div>

        <div className="mt-2 text-xs text-gray-600">
          <span className="font-medium">Have:</span> {item.whatWeHave}
          {item.whatIsMissing !== 'None' && <> · <span className="font-medium text-orange-600">Need:</span> {item.whatIsMissing}</>}
        </div>

        {isExpanded && (
          <div className="mt-3 pt-3 border-t space-y-2 text-xs">
            <div><span className="font-medium text-gray-700">Why required:</span> <span className="text-gray-600">{item.whyRequired}</span></div>
            <div><span className="font-medium text-gray-700">Business impact:</span> <span className="text-gray-600">{item.businessImpact}</span></div>
            {item.securityImpact !== 'None' && <div><span className="font-medium text-red-700">Security impact:</span> <span className="text-red-600">{item.securityImpact}</span></div>}
            <div><span className="font-medium text-blue-700">How to configure:</span> <span className="text-blue-600">{item.howToConfigure}</span></div>
            <div><span className="font-medium text-purple-700">Next action:</span> <span className="text-purple-600">{item.nextAction}</span></div>
            {item.blockingReason && <div className="bg-red-50 p-2 rounded"><span className="font-medium text-red-700">Blocking reason:</span> {item.blockingReason}</div>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Production Connection Readiness</h1>
          <p className="text-sm text-gray-500 mt-1">External dependency validation for production deployment.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadPreflight} className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700">
            Re-run Preflight
          </button>
          <Link href="/platform" className="text-sm text-purple-600 hover:underline">← Platform</Link>
        </div>
      </div>

      {/* Overall Status */}
      <div className={`rounded-xl border p-5 ${overallColor}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{overallLabel}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {report.summary.verified}/{report.summary.total - report.summary.optional} required dependencies verified ·
              {report.summary.blocking > 0 ? ` ${report.summary.blocking} blocking` : ' No blockers'} ·
              Environment: {report.environment}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold">{report.score}%</p>
            <p className="text-xs text-gray-500">Readiness Score</p>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {report.warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          {report.warnings.map((w, i) => <p key={i} className="text-sm text-yellow-800">⚠ {w}</p>)}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-green-50 rounded-lg border border-green-200 p-3 text-center">
          <div className="text-xl font-bold text-green-700">{report.summary.verified}</div>
          <div className="text-[10px] text-green-600">Verified</div>
        </div>
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
          <div className="text-xl font-bold text-blue-700">{report.summary.ready}</div>
          <div className="text-[10px] text-blue-600">Ready to Connect</div>
        </div>
        <div className="bg-red-50 rounded-lg border border-red-200 p-3 text-center">
          <div className="text-xl font-bold text-red-700">{report.summary.missing}</div>
          <div className="text-[10px] text-red-600">Missing</div>
        </div>
        <div className="bg-gray-50 rounded-lg border p-3 text-center">
          <div className="text-xl font-bold text-gray-600">{report.summary.optional}</div>
          <div className="text-[10px] text-gray-500">Optional</div>
        </div>
        <div className="bg-red-50 rounded-lg border border-red-300 p-3 text-center">
          <div className="text-xl font-bold text-red-800">{report.summary.blocking}</div>
          <div className="text-[10px] text-red-700">Blocking</div>
        </div>
      </div>

      {/* Dependency List */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-gray-700">All Dependencies</h3>
        {allItems.map(renderItem)}
      </div>

      {/* Timestamp */}
      <div className="text-center text-xs text-gray-400 pt-4 border-t">
        Preflight run: {new Date(report.timestamp).toLocaleString()} · Click any item for details
      </div>
    </div>
  );
}
