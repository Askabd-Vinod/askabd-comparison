'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';

/**
 * Honest empty state for client-detail sub-pages that have no dedicated,
 * per-client, database-backed implementation yet.
 *
 * PREVIOUSLY (until this milestone's "make the SYSTEM genuinely good" pass):
 * this component showed hardcoded, identical-for-every-client fake metrics
 * ("CPU Avg: 32%", "Uptime: 99.9%", "MTTR: 23 min", etc. — literal constants,
 * never fetched from anywhere) plus an unconditional green "Operational —
 * Connected to AskABD Platform... Data flows automatically from connected
 * infrastructure" banner, regardless of whether any such connection or data
 * flow existed. Every REAL client created through the actual onboarding flow
 * this session (i.e., every client that is not one of the ~20 static entries
 * in lib/mock-clients.ts) hit exactly this fabricated fallback on Roadmap,
 * Testing, Knowledge, Consulting, Contacts, Timeline, Automation, Contracts,
 * Support, Performance, and Usage — 32 consuming pages total. This directly
 * violated the platform's own "CONFIGURED != CONNECTED", "never fabricate
 * ... integration success" principle (see docs/real-data-integrity-register.md
 * and docs/enterprise-feature-gap-register.md).
 *
 * NOW: this component makes no claim it cannot back with evidence. It states
 * plainly that no dedicated tracking exists yet for this capability, and
 * links only to real, working pages elsewhere in the client's workspace.
 */
export function CapabilityPlaceholder({ title, description }: { title: string; description: string }) {
  const params = useParams();
  const clientId = params.clientId as string;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">📦</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{description}</p>
            </div>
          </div>
          <span className="text-[9px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded uppercase">Not yet available</span>
        </div>
      </div>

      {/* Honest status */}
      <div className="bg-white rounded-xl border p-5">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-700 mb-1">No dedicated {title.toLowerCase()} tracking exists yet for this client</p>
          <p className="text-[10px] text-gray-500">This area of the client workspace does not yet have a database-backed implementation, so nothing is shown here rather than a fabricated status. Real, verified data for this client is available on the pages below.</p>
        </div>
      </div>

      {/* Navigation to real, working pages */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4">Real Data For This Client</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Link href={`/clients/${clientId}/services`} className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 hover:bg-purple-50 hover:border-purple-200 transition">
            <span className="text-purple-500">→</span>
            <p className="text-xs text-gray-700">View confirmed services</p>
          </Link>
          <Link href={`/clients/${clientId}/connectors`} className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 hover:bg-purple-50 hover:border-purple-200 transition">
            <span className="text-purple-500">→</span>
            <p className="text-xs text-gray-700">View connection status</p>
          </Link>
          <Link href={`/clients/${clientId}/readiness`} className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 hover:bg-purple-50 hover:border-purple-200 transition">
            <span className="text-purple-500">→</span>
            <p className="text-xs text-gray-700">View readiness</p>
          </Link>
          <Link href={`/clients/${clientId}/lifecycle`} className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 hover:bg-purple-50 hover:border-purple-200 transition">
            <span className="text-purple-500">→</span>
            <p className="text-xs text-gray-700">View delivery lifecycle</p>
          </Link>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <Link href={`/clients/${clientId}/lifecycle`} className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 hover:bg-gray-50 transition">
          ← Back to Lifecycle
        </Link>
        <Link href={`/clients/${clientId}`} className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 hover:bg-gray-50 transition">
          Overview
        </Link>
      </div>
    </div>
  );
}
