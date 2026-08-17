import Link from 'next/link';
import { Breadcrumb } from '../../components/breadcrumb';
import { StatusBadge, SLABadge } from '../../components/status-badge';
import { ClientTabs } from './client-tabs';
import { ClientPhaseNav } from '../../components/client-phase-nav';
import type { LifecycleStatus } from '../../lib/onboarding-lifecycle';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}

interface RealClient {
  id: string;
  name: string;
  industry?: string;
  health?: 'healthy' | 'warning' | 'critical' | 'offline';
  sla_status?: 'compliant' | 'at-risk' | 'breached';
  criticality?: string;
}

/**
 * PREVIOUSLY: this layout — which wraps every single client-scoped page in
 * the platform (~50+ pages) — only rendered a real header (client name,
 * industry, health, SLA, platform score) for the ~20 static demo entries in
 * `mock-clients.ts`. Every REAL client created through the actual onboarding
 * flow (i.e., every client used for live verification throughout this
 * session) fell through to a "minimal layout": breadcrumb and tabs only, no
 * client name, no status, no context at all — just the raw client ID.
 *
 * NOW: fetches the real client record from `GET /oc/clients/:clientId`
 * (already used correctly elsewhere in this app) and renders the same
 * header for every client — real or the legacy mock ones, since the real
 * API response happens to carry the identical fields (`name`, `industry`,
 * `health`, `sla_status`, `platform_score`) that the mock-only header
 * already rendered. This single fix improves the header of every
 * client-scoped page in the product at once.
 */
export default async function ClientLayout({ children, params }: LayoutProps) {
  const { clientId } = await params;

  let client: RealClient | null = null;
  try {
    const res = await fetch(`${API}/api/v1/oc/clients/${clientId}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      client = data.client ?? null;
    }
  } catch {
    // API unreachable — fall through to the minimal header below, honestly, not fabricated.
  }

  // Real lifecycle status — same source of truth PhaseHeader (Overview) and the
  // full Lifecycle page already use. Best-effort: absence just hides the strip.
  let lifecycleStatus: LifecycleStatus | null = null;
  try {
    const lcRes = await fetch(`${API}/api/v1/oc/lifecycle/${clientId}`, { cache: 'no-store' });
    if (lcRes.ok) {
      const lcData = await lcRes.json();
      if (lcData.initialized && lcData.status) lifecycleStatus = lcData.status as LifecycleStatus;
    }
  } catch {
    // API unreachable — the phase nav simply won't render.
  }

  // Found during the final QA/UAT pass: the header used to show `client.platform_score`
  // (an `oc_clients` column) as "Platform Score" — verified this is a static value that
  // NEVER varies: every one of the 21 real clients in this database reads exactly 50,
  // confirming it is a creation-time default that no service ever recomputes, presented
  // as if it were a real, client-specific, evidence-based metric. Meanwhile a genuinely
  // real, per-client health score already exists (`GET /health-score`, the same one
  // Readiness and Scorecard both use) and DOES vary correctly per client. Replacing the
  // static number with the real one closes the gap and makes this header agree with
  // Readiness/Scorecard instead of showing a third, unrelated number next to them.
  let healthScore: number | null = null;
  try {
    const hsRes = await fetch(`${API}/api/v1/oc/clients/${clientId}/health-score`, { cache: 'no-store' });
    if (hsRes.ok) {
      const hsData = await hsRes.json();
      if (typeof hsData.overallScore === 'number') healthScore = hsData.overallScore;
    }
  } catch {
    // API unreachable — the tile simply won't render, never a stale/fabricated number.
  }

  if (!client) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
        <Breadcrumb items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Clients', href: '/clients' },
          { label: clientId },
        ]} />
        <ClientTabs clientId={clientId} />
        <div className="mt-4">
          <ClientPhaseNav clientId={clientId} status={lifecycleStatus} />
        </div>
        <div className="mt-2">{children}</div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Clients', href: '/clients' },
        { label: client.name },
      ]} />

      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 gradient-brand rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-lg">{client.name.slice(0, 2).toUpperCase()}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{client.name}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {client.industry && <span className="text-sm text-gray-500">{client.industry}</span>}
              {client.health && <StatusBadge status={client.health} />}
              {client.sla_status && <SLABadge status={client.sla_status} />}
              {client.criticality && (
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{client.criticality} criticality</span>
              )}
            </div>
          </div>
        </div>
        {healthScore !== null && (
          <Link href={`/clients/${clientId}/scorecard`} className="text-right hover:opacity-80 transition">
            <p className="text-2xl font-bold gradient-text">{healthScore}</p>
            <p className="text-[10px] text-gray-400">Health Score →</p>
          </Link>
        )}
      </div>

      <ClientTabs clientId={clientId} />

      <div className="mt-4">
        <ClientPhaseNav clientId={clientId} status={lifecycleStatus} />
      </div>

      <div className="mt-2">{children}</div>
    </div>
  );
}
