'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSession, authFetch, logout } from '../../../../lib/session';
import { getCurrentStepInfo, type LifecycleStatus } from '../../../../lib/onboarding-lifecycle';

interface StageData { id: string; label: string; status: string; summary: string; detail?: string; count?: number; link: string; }

const LIFECYCLE_STAGE_MAP: Record<string, number> = {
  'organization-created': 0, 'otp-sent': 0, 'otp-verified': 0, 'identity-verified': 1,
  'security-validated': 1, 'environment-registered': 1, 'connectors-configured': 1,
  'discovery-running': 2, 'discovery-complete': 3,
  'assessment-running': 3, 'assessment-complete': 4,
  'recommendations-generated': 5, 'migration-planning': 6, 'migration-approved': 7,
  'migration-running': 8, 'migration-complete': 9,
  'validation-running': 9, 'validation-passed': 10,
  'managed-services': 11, 'engineering-intelligence': 11,
};

// Friendly, business-readable labels for the raw internal lifecycle status
// enum — a customer should never see a literal value like "otp-verified" or
// "migration-running". Found during the 2026-08-22 global UX audit (this
// header line used to print the raw enum and the internal clientId
// directly). Reuses the single shared statusMeta label (onboarding-lifecycle.ts)
// rather than duplicating the mapping — the portal home header uses the
// same source so both pages always agree.

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-green-500', in_progress: 'bg-blue-500', action_required: 'bg-orange-500', not_enabled: 'bg-gray-300',
};
const STATUS_ICON: Record<string, string> = {
  completed: '✓', in_progress: '●', action_required: '!', not_enabled: '−',
};

export default function JourneyPage() {
  const { clientId } = useParams() as { clientId: string };
  const [home, setHome] = useState<any>(null);
  const [problems, setProblems] = useState<any[]>([]);
  const [gaps, setGaps] = useState<any[]>([]);
  const [transformations, setTransformations] = useState<any[]>([]);
  const [discovery, setDiscovery] = useState<any>(null);
  const [assessment, setAssessment] = useState<any>(null);
  const [clientServices, setClientServices] = useState<Record<string, string>>({});
  const [engagementData, setEngagementData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadData = useCallback(async () => {
    // Real auth guard: no session at all → straight to login, no data ever requested.
    // (Previously this page issued every request with NO Authorization header at
    // all — a real, live-found bug: every one of these calls silently 401'd the
    // moment real JWKS auth was enforced, and this page just rendered as if the
    // data genuinely didn't exist. authFetch now attaches the real bearer token
    // and transparently renews it near/at expiry, same as every other portal page.)
    if (!getSession()) {
      router.replace(`/login?next=${encodeURIComponent(`/client-portal/${clientId}/journey`)}`);
      return;
    }
    try {
      setLoading(true);
      const base = `/api/v1/oc/portal/${clientId}`;
      const [hRes, pRes, gRes, tRes, dRes, aRes, csRes, eRes] = await Promise.all([
        authFetch(`${base}/home`), authFetch(`${base}/problems`), authFetch(`${base}/gaps`), authFetch(`${base}/transformations`),
        authFetch(`/api/v1/oc/discovery/${clientId}`).catch(() => null),
        authFetch(`/api/v1/oc/assessment/${clientId}`).catch(() => null),
        authFetch(`/api/v1/oc/clients/${clientId}/services`).catch(() => null),
        authFetch(`/api/v1/oc/clients/${clientId}/engagements`).catch(() => null),
      ]);
      if (hRes.status === 401) {
        await logout();
        router.replace(`/login?next=${encodeURIComponent(`/client-portal/${clientId}/journey`)}&expired=1`);
        return;
      }
      if (hRes.ok) setHome(await hRes.json());
      if (pRes.ok) setProblems((await pRes.json()).problems || []);
      if (gRes.ok) setGaps((await gRes.json()).gaps || []);
      if (tRes.ok) setTransformations((await tRes.json()).transformations || []);
      if (dRes?.ok) { const d = await dRes.json(); setDiscovery(d.runs?.[0] || null); }
      if (aRes?.ok) { const a = await aRes.json(); setAssessment(a.assessments?.[0] || null); }
      if (csRes?.ok) { const cs = await csRes.json(); const map: Record<string, string> = {}; (cs.services || []).forEach((s: any) => { map[s.serviceId] = s.clientStatus; }); setClientServices(map); }
      let engData: any[] = [];
      if (eRes?.ok) { const ed = await eRes.json(); engData = ed.engagements || []; }
      setEngagementData(engData);
    } catch {} finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <p className="text-xs text-gray-500 text-center py-16">Loading journey…</p>;
  if (!home) return <p className="text-xs text-red-600 text-center py-16">Unable to load client data</p>;

  const lcStatus = home.lifecycle?.status || 'organization-created';
  const currentStageIdx = LIFECYCLE_STAGE_MAP[lcStatus] ?? -1;

  const getStageStatus = (idx: number): string => {
    if (currentStageIdx < 0) return 'not_started';
    if (idx < currentStageIdx) return 'completed';
    if (idx === currentStageIdx) return 'in_progress';
    return 'not_started';
  };

  // Service-aware stage status: if a service is explicitly disabled, override
  const STAGE_SERVICE_MAP: Record<string, string> = {
    'discover': 'cap-discovery-engine', 'assess': 'cap-assessment-engine',
    'problems': 'cap-problem-universe', 'gaps': 'cap-gap-analysis',
    'value': 'cap-financial-impact', 'options': 'cap-decision-framework',
    'decision': 'cap-decision-framework', 'transform': 'cap-transformation-planning',
    'validate': 'cap-migration-validation', 'outcome': 'cap-optimization-engine',
    'optimize': 'cap-optimization-engine',
  };
  const isServiceDisabled = (stageId: string): boolean => {
    const svcId = STAGE_SERVICE_MAP[stageId];
    return svcId ? clientServices[svcId] === 'disabled' : false;
  };

  const fmt = (n: number) => n >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;

  const discResources = discovery?.resources_found || discovery?.results?.resourceCount || 0;
  const discSummary = discovery?.results?.summary;
  const assessFindings = assessment?.findings?.length || 0;
  const assessRisk = assessment?.riskScore || assessment?.risk_score || 0;

  const stages: StageData[] = [
    { id: 'onboard', label: 'Onboard', status: getStageStatus(0), summary: 'Organization registered and verified', detail: `${home.requirements?.total || 0} requirements collected`, link: `/client-portal/${clientId}` },
    { id: 'discover', label: 'Discover', status: discovery ? 'completed' : getStageStatus(2), summary: discovery ? `${discResources} resources discovered` : 'Environment discovery', detail: discovery ? `${discSummary?.tables || '?'} tables • ${discSummary?.applications || '?'} applications • ${discSummary?.servers || '?'} servers` : 'Awaiting connector configuration', count: discResources || undefined, link: `/client-portal/${clientId}` },
    { id: 'assess', label: 'Assess', status: assessment ? 'completed' : getStageStatus(3), summary: assessment ? `Risk score: ${assessRisk}/100 • ${assessFindings} findings` : 'Risk assessment', detail: assessment ? `Complexity: ${assessment.complexity_score || assessment.complexityScore || '?'}/100 • ${assessment.recommendations?.length || 0} recommendations` : 'Awaiting discovery completion', count: assessFindings || undefined, link: `/client-portal/${clientId}` },
    { id: 'problems', label: 'Problems', status: problems.length > 0 ? 'completed' : getStageStatus(4), summary: `${problems.length} problem${problems.length !== 1 ? 's' : ''} identified`, detail: home.problems?.critical > 0 ? `${home.problems.critical} critical • ${home.problems.high || 0} high` : 'No critical issues', count: problems.length, link: `/client-portal/${clientId}?tab=problems` },
    { id: 'gaps', label: 'Gaps', status: gaps.length > 0 ? 'completed' : getStageStatus(5), summary: `${gaps.length} gap${gaps.length !== 1 ? 's' : ''} identified`, detail: `${home.gaps?.open || 0} open gaps requiring attention`, count: gaps.length, link: `/client-portal/${clientId}?tab=gaps` },
    { id: 'value', label: 'Value', status: home.financial?.expectedSavings > 0 || home.financial?.realizedSavings > 0 ? 'completed' : getStageStatus(5), summary: 'Financial impact and effort analysis', detail: home.financial?.realizedSavings > 0 ? `${fmt(home.financial.realizedSavings)} realized • ${home.financial.benefitRealization}% benefit realization` : home.financial?.expectedSavings > 0 ? `${fmt(home.financial.expectedSavings)} potential savings` : 'Awaiting analysis', link: `/client-portal/${clientId}` },
    { id: 'options', label: 'Options', status: getStageStatus(6), summary: 'Transformation options compared', detail: 'Weighted comparison of alternatives', link: `/client-portal/${clientId}` },
    { id: 'decision', label: 'Decision', status: getStageStatus(7), summary: 'Transformation decision approved', detail: 'Selected option with rationale and approval', link: `/client-portal/${clientId}` },
    { id: 'engagement', label: 'Engagement', status: engagementData.length > 0 ? (engagementData.some(e => e.status === 'active' || e.status === 'completed') ? 'completed' : 'in_progress') : 'not_started', summary: engagementData.length > 0 ? `${engagementData.length} engagement${engagementData.length > 1 ? 's' : ''} · ${engagementData[0]?.status}` : 'Commercial engagement and scope', detail: engagementData.length > 0 ? `${engagementData[0]?.name || 'Engagement'} · ${engagementData[0]?.engagement_type || ''}` : 'Services, pricing, and proposal', link: `/client-portal/${clientId}` },
    { id: 'transform', label: 'Transform', status: transformations.length > 0 ? (transformations.some(t => t.status === 'completed') ? 'completed' : 'in_progress') : getStageStatus(8), summary: transformations[0]?.title || 'Transformation plan', detail: transformations[0]?.duration ? `Duration: ${transformations[0].duration} • ${transformations[0].phases?.length || 0} phases` : 'Awaiting approval', link: `/client-portal/${clientId}?tab=transformations` },
    { id: 'validate', label: 'Validate', status: getStageStatus(10), summary: 'Post-transformation validation', detail: 'Integrity and correctness verification', link: `/client-portal/${clientId}` },
    { id: 'outcome', label: 'Outcome', status: home.financial?.benefitRealization > 0 ? 'completed' : getStageStatus(11), summary: home.financial?.benefitRealization > 0 ? `${home.financial.benefitRealization}% benefit realized` : 'Measure expected vs actual', detail: home.financial?.realizedSavings > 0 ? `Expected: ${fmt(home.financial.expectedSavings || 0)} • Actual: ${fmt(home.financial.realizedSavings)}` : 'Awaiting measurement', link: `/client-portal/${clientId}?tab=financial` },
    { id: 'optimize', label: 'Optimize', status: home.optimization?.openFindings > 0 ? 'in_progress' : getStageStatus(11), summary: 'Continuous improvement', detail: home.optimization?.openFindings > 0 ? `${home.optimization.openFindings} optimization opportunities` : 'Monitoring active', link: `/client-portal/${clientId}?tab=optimization` },
  ];

  // Next action determination
  let nextAction = 'Platform is monitoring your environment';
  if (home.requirements?.missing > 0) nextAction = `Complete ${home.requirements.missing} missing requirement(s)`;
  else if (home.connectors?.total > 0 && home.connectors.connected < home.connectors.total) nextAction = 'Validate remaining connectors';
  else if (home.problems?.critical > 0) nextAction = `Review ${home.problems.critical} critical problem(s)`;
  else if (home.gaps?.open > 0) nextAction = `Address ${home.gaps.open} open gap(s)`;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="text-lg font-bold text-gray-900">Transformation Journey</h1>
        <p className="text-xs text-gray-500 mt-0.5">{getCurrentStepInfo(lcStatus as LifecycleStatus).label}</p>
        {clientId === 'demo-meridian-financial' && <span className="inline-block mt-1 text-[9px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded">DEMO — Fictional Data</span>}
      </div>

      {/* Executive Summary Bar */}
      <div className="bg-white rounded-xl border p-4 mb-5 flex flex-wrap gap-4 justify-between">
        <div>
          <p className="text-[10px] text-gray-400">Overall Progress</p>
          <p className="text-lg font-bold text-blue-600">{home.lifecycle?.progress || 0}%</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">Problems</p>
          <p className={`text-lg font-bold ${home.problems?.critical > 0 ? 'text-red-600' : 'text-green-600'}`}>{home.problems?.total || 0}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">Open Gaps</p>
          <p className="text-lg font-bold text-orange-600">{home.gaps?.open || 0}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">Realized Savings</p>
          <p className="text-lg font-bold text-green-600">{fmt(home.financial?.realizedSavings || 0)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">Benefit Realization</p>
          <p className="text-lg font-bold text-gray-900">{home.financial?.benefitRealization || 0}%</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">Next Action</p>
          <p className="text-xs font-medium text-purple-600">{nextAction}</p>
        </div>
      </div>

      {/* Journey Timeline */}
      <div className="relative">
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />
        <div className="space-y-1.5">
          {stages.map(stage => {
            const disabled = isServiceDisabled(stage.id);
            const effectiveStatus = disabled ? 'not_enabled' : stage.status;
            return (
              <a key={stage.id} href={disabled ? '#' : stage.link} className={`block relative ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className={`flex gap-4 items-start p-3 rounded-lg border transition ${effectiveStatus === 'in_progress' ? 'bg-blue-50/40 border-blue-200' : 'border-transparent hover:bg-gray-50'}`}>
                  <span className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0 z-10 ${STATUS_DOT[effectiveStatus] || 'bg-gray-300'}`}>
                    {STATUS_ICON[effectiveStatus] || '○'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${effectiveStatus === 'not_started' || effectiveStatus === 'not_enabled' ? 'text-gray-400' : 'text-gray-900'}`}>{stage.label}</span>
                      {effectiveStatus === 'in_progress' && <span className="text-[9px] font-semibold px-2 py-0.5 bg-blue-600 text-white rounded-full">YOU ARE HERE</span>}
                      {disabled && <span className="text-[9px] font-semibold px-2 py-0.5 bg-gray-200 text-gray-500 rounded-full">Not enabled</span>}
                      {stage.count != null && stage.count > 0 && !disabled && <span className="text-[10px] text-gray-400">{stage.count} items</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{stage.summary}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{stage.detail}</p>
                  </div>
                  <span className="text-gray-300 self-center text-sm">→</span>
                </div>
              </a>
            );
          })}
        </div>
      </div>

      {/* Automation Summary */}
      <section className="bg-white rounded-xl border p-4 mt-5">
        <h3 className="text-xs font-semibold text-gray-500 mb-2.5">What AskABD Did Automatically</h3>
        <div className="flex flex-wrap gap-2">
          {home.requirements?.total > 0 && <span className="text-[11px] px-2.5 py-1 bg-green-50 text-green-700 rounded-full">✓ Onboarding information reused</span>}
          {discovery && <span className="text-[11px] px-2.5 py-1 bg-green-50 text-green-700 rounded-full">✓ Discovered {discResources} resources</span>}
          {assessment && <span className="text-[11px] px-2.5 py-1 bg-green-50 text-green-700 rounded-full">✓ Generated {assessFindings} assessment findings</span>}
          {problems.length > 0 && <span className="text-[11px] px-2.5 py-1 bg-green-50 text-green-700 rounded-full">✓ {problems.length} problems identified</span>}
          {gaps.length > 0 && <span className="text-[11px] px-2.5 py-1 bg-green-50 text-green-700 rounded-full">✓ {gaps.length} gaps auto-generated</span>}
          {home.financial?.realizedSavings > 0 && <span className="text-[11px] px-2.5 py-1 bg-green-50 text-green-700 rounded-full">✓ Benefits measured: {fmt(home.financial.realizedSavings)}</span>}
          {home.optimization?.openFindings > 0 && <span className="text-[11px] px-2.5 py-1 bg-green-50 text-green-700 rounded-full">✓ Optimization monitoring active</span>}
          {home.notifications?.unread > 0 && <span className="text-[11px] px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full">🔔 {home.notifications.unread} notifications</span>}
        </div>
      </section>
    </div>
  );
}
