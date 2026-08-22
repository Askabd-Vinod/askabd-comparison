'use client';
import Link from 'next/link';
import { severityColors, statusColors, confidenceColors, confidenceLabels, type RealDefect } from '../../lib/real-engineering';

export function EngineeringDefectsTable({ defects, clientNameById }: { defects: RealDefect[]; clientNameById: Record<string, string> }) {
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
            <th className="text-center px-3 py-3">Root Cause</th>
            <th className="text-center px-3 py-3">Occurrences</th>
            <th className="text-left px-3 py-3">Last Seen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {defects.map(d => (
            <tr key={d.id} className="hover:bg-gray-50 transition">
              <td className="px-5 py-3">
                <Link href={`/engineering/${d.id}`} className="font-medium text-xs text-gray-900 hover:text-purple-700">
                  {d.title}
                </Link>
                {d.occurrence_count > 1 && <span className="ml-2 text-[8px] bg-orange-100 text-orange-600 px-1 py-0.5 rounded font-medium">RECURRING</span>}
              </td>
              <td className="px-3 py-3 text-xs text-gray-500 capitalize">{d.category.replace('-', ' ')}</td>
              <td className="px-3 py-3"><span className={`text-[10px] font-medium px-2 py-0.5 rounded ${severityColors[d.severity] || 'bg-gray-100 text-gray-600'}`}>{d.severity}</span></td>
              <td className="px-3 py-3"><span className={`text-[10px] font-medium px-2 py-0.5 rounded ${statusColors[d.status] || 'bg-gray-100 text-gray-600'}`}>{d.status.replace('-', ' ')}</span></td>
              <td className="px-3 py-3 text-xs text-gray-600">
                {d.client_id ? (clientNameById[d.client_id] ? <Link href={`/clients/${d.client_id}`} className="hover:text-purple-700">{clientNameById[d.client_id]}</Link> : 'Unknown client') : <span className="text-gray-400">Platform-wide</span>}
              </td>
              <td className="px-3 py-3 text-center">
                <span className={`text-[10px] font-medium ${confidenceColors[d.root_cause_confidence] || 'text-gray-300'}`}>{confidenceLabels[d.root_cause_confidence] || 'Unknown'}</span>
              </td>
              <td className="px-3 py-3 text-center text-xs font-mono">{d.occurrence_count}</td>
              <td className="px-3 py-3 text-[10px] text-gray-400">{new Date(d.last_seen_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
