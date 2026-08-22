'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface Incident {
  id: string;
  client_id: string | null;
  severity: string;
  title: string;
  description: string;
  affected_service: string;
  status: string;
  detected_at: string;
  resolved_at: string | null;
  duration_minutes: number;
  root_cause: string;
  jira_issue_key: string;
  impact_summary: string;
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadIncidents(); }, []);

  async function loadIncidents() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/incidents`);
      if (res.ok) {
        const data = await res.json();
        setIncidents(data.incidents || []);
      }
    } catch { /* API unavailable */ }
    setLoading(false);
  }

  const openCount = incidents.filter(i => !['resolved', 'verified', 'closed'].includes(i.status)).length;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incident Center</h1>
          <p className="text-sm text-gray-500 mt-1">Operational incidents across the platform.</p>
        </div>
        <Link href="/platform" className="text-sm text-purple-600 hover:underline">← Platform</Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold">{incidents.length}</div>
          <div className="text-xs text-gray-500">Total Incidents</div>
        </div>
        <div className={`rounded-lg border p-4 text-center ${openCount > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <div className={`text-2xl font-bold ${openCount > 0 ? 'text-red-700' : 'text-green-700'}`}>{openCount}</div>
          <div className={`text-xs ${openCount > 0 ? 'text-red-600' : 'text-green-600'}`}>Open</div>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-200 p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{incidents.filter(i => i.status === 'resolved' || i.status === 'verified').length}</div>
          <div className="text-xs text-green-600">Resolved</div>
        </div>
        <div className="bg-gray-50 rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold text-gray-600">{incidents.filter(i => i.jira_issue_key).length}</div>
          <div className="text-xs text-gray-500">Jira Tracked</div>
        </div>
      </div>

      {/* Incident List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading incidents...</div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-gray-50">
          <p className="text-gray-500 font-medium">No incidents recorded</p>
          <p className="text-xs text-gray-400 mt-1">Incidents are created from defects, health failures, and operational events.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map(inc => (
            <div key={inc.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    inc.severity === 'critical' ? 'bg-red-100 text-red-800' :
                    inc.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>{inc.severity}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    inc.status === 'detected' ? 'bg-red-50 text-red-700' :
                    inc.status === 'resolved' ? 'bg-green-50 text-green-700' :
                    'bg-blue-50 text-blue-700'
                  }`}>{inc.status}</span>
                  <span className="font-medium text-sm">{inc.title}</span>
                </div>
                <div className="text-xs text-gray-400">
                  {new Date(inc.detected_at).toLocaleString()}
                  {inc.duration_minutes > 0 && ` • ${inc.duration_minutes}m`}
                </div>
              </div>
              {inc.impact_summary && <p className="text-xs text-gray-500 mt-2">{inc.impact_summary}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
