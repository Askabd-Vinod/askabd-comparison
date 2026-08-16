'use client';
import Link from 'next/link';
import type { EngineeringDefect, Severity, DefectStatus } from '../lib/engineering-intelligence';

const severityColors: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-blue-100 text-blue-700',
  info: 'bg-gray-100 text-gray-600',
};

const statusColors: Record<DefectStatus, string> = {
  detected: 'bg-red-100 text-red-700',
  analysing: 'bg-blue-100 text-blue-700',
  'rca-complete': 'bg-indigo-100 text-indigo-700',
  'solution-proposed': 'bg-purple-100 text-purple-700',
  'fix-validated': 'bg-green-100 text-green-700',
  resolved: 'bg-green-200 text-green-800',
  closed: 'bg-gray-100 text-gray-600',
};

export function EngineeringDefectsTable({ defects }: { defects: EngineeringDefect[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            <th className="text-left px-5 py-3">Defect</th>
            <th className="text-left px-3 py-3">Category</th>
            <th className="text-left px-3 py-3">Severity</th>
            <th className="text-left px-3 py-3">Status</th>
            <th className="text-left px-3 py-3">Client</th>
            <th className="text-center px-3 py-3">Confidence</th>
            <th className="text-center px-3 py-3">Occurrences</th>
            <th className="text-left px-3 py-3">Detected</th>
            <th className="text-left px-3 py-3">Owner</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {defects.map(d => (
            <tr key={d.id} className="hover:bg-gray-50 transition">
              <td className="px-5 py-3">
                <Link href={`/engineering/${d.id}`} className="font-medium text-xs text-gray-900 hover:text-purple-700">
                  {d.title}
                </Link>
                {d.recurring && <span className="ml-2 text-[8px] bg-orange-100 text-orange-600 px-1 py-0.5 rounded font-medium">RECURRING</span>}
              </td>
              <td className="px-3 py-3 text-xs text-gray-500 capitalize">{d.category.replace('-', ' ')}</td>
              <td className="px-3 py-3"><span className={`text-[10px] font-medium px-2 py-0.5 rounded ${severityColors[d.severity]}`}>{d.severity}</span></td>
              <td className="px-3 py-3"><span className={`text-[10px] font-medium px-2 py-0.5 rounded ${statusColors[d.status]}`}>{d.status.replace('-', ' ')}</span></td>
              <td className="px-3 py-3 text-xs text-gray-600">{d.clientName}</td>
              <td className="px-3 py-3 text-center">
                {d.confidenceScore > 0 ? (
                  <span className={`text-xs font-bold ${d.confidenceScore >= 80 ? 'text-green-600' : d.confidenceScore >= 50 ? 'text-orange-600' : 'text-gray-400'}`}>{d.confidenceScore}%</span>
                ) : (
                  <span className="text-[10px] text-gray-300">—</span>
                )}
              </td>
              <td className="px-3 py-3 text-center text-xs font-mono">{d.occurrenceCount}</td>
              <td className="px-3 py-3 text-[10px] text-gray-400">{new Date(d.detectedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
              <td className="px-3 py-3 text-[10px] text-gray-500">{d.owner}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
