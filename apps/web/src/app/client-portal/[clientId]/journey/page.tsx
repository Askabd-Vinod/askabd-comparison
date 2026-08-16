'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const base = `${API}/api/v1/oc/portal/${clientId}`;
      const [hRes, pRes, gRes, tRes, dRes, aRes, csRes, eRes] = await Promise.all([
        fetch(`${base}/home`), fetch(`${base}/problems`), fetch(`${base}/gaps`), fetch(`${base}/transformations`),
        fetch(`${API}/api/v1/oc/discovery/${clientId}`).catch(() => null),
        fetch(`${API}/api/v1/oc/assessment/${clientId}`).catch(() => null),
        fetch(`${API}/api/v1/oc/clients/${clientId}/services`).catch(() => null),
        fetch(`${API}/api/v1/oc/clients/${clientId}/engagements`).catch(() => null),
      ]);
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

  if (loading) return <div style={{ padding: 40, color: '#64748b', textAlign: 'center', background: '#0f172a', minHeight: '100vh' }}>Loading journey...</div>;
  if (!home) return <div style={{ padding: 40, color: '#ef4444', background: '#0f172a', minHeight: '100vh' }}>Unable to load client data</div>;

  const lcStatus = home.lifecycle?.status || 'unknown';
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

  const fmt = (n: number) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n}`;

  const discResources = discovery?.resources_found || discovery?.results?.resourceCount || 0;
  const discSummary = discovery?.results?.summary;
  const assessFindings = assessment?.findings?.length || 0;
  const assessRisk = assessment?.riskScore || assessment?.risk_score || 0;

  const stages: StageData[] = [
    { id: 'onboard', label: 'Onboard', status: getStageStatus(0), summary: 'Organization registered and verified', detail: `${home.requirements?.total || 0} requirements collected`, link: `/client-portal/${clientId}` },
    { id: 'discover', label: 'Discover', status: discovery ? 'completed' : getStageStatus(2), summary: discovery ? `${discResources} resources discovered` : 'Environment discovery', detail: discovery ? `${discSummary?.tables || '?'} tables • ${discSummary?.applications || '?'} applications • ${discSummary?.servers || '?'} servers` : 'Awaiting connector configuration', count: discResources || undefined, link: `/client-portal/${clientId}` },
    { id: 'assess', label: 'Assess', status: assessment ? 'completed' : getStageStatus(3), summary: assessment ? `Risk score: ${assessRisk}/100 • ${assessFindings} findings` : 'Risk assessment', detail: assessment ? `Complexity: ${assessment.complexity_score || assessment.complexityScore || '?'}/100 • ${assessment.recommendations?.length || 0} recommendations` : 'Awaiting discovery completion', count: assessFindings || undefined, link: `/client-portal/${clientId}` },
    { id: 'problems', label: 'Problems', status: problems.length > 0 ? 'completed' : getStageStatus(4), summary: `${problems.length} problem${problems.length !== 1 ? 's' : ''} identified`, detail: home.problems?.critical > 0 ? `${home.problems.critical} critical • ${home.problems.high || 0} high` : 'No critical issues', count: problems.length, link: `/clients/${clientId}/problems` },
    { id: 'gaps', label: 'Gaps', status: gaps.length > 0 ? 'completed' : getStageStatus(5), summary: `${gaps.length} gap${gaps.length !== 1 ? 's' : ''} identified`, detail: `${home.gaps?.open || 0} open gaps requiring attention`, count: gaps.length, link: `/clients/${clientId}/gaps` },
    { id: 'value', label: 'Value', status: home.financial?.expectedSavings > 0 || home.financial?.realizedSavings > 0 ? 'completed' : getStageStatus(5), summary: 'Financial impact and effort analysis', detail: home.financial?.realizedSavings > 0 ? `${fmt(home.financial.realizedSavings)} realized • ${home.financial.benefitRealization}% benefit realization` : home.financial?.expectedSavings > 0 ? `${fmt(home.financial.expectedSavings)} potential savings` : 'Awaiting analysis', link: `/client-portal/${clientId}` },
    { id: 'options', label: 'Options', status: getStageStatus(6), summary: 'Transformation options compared', detail: 'Weighted comparison of alternatives', link: `/client-portal/${clientId}` },
    { id: 'decision', label: 'Decision', status: getStageStatus(7), summary: 'Transformation decision approved', detail: 'Selected option with rationale and approval', link: `/client-portal/${clientId}` },
    { id: 'engagement', label: 'Engagement', status: engagementData.length > 0 ? (engagementData.some(e => e.status === 'active' || e.status === 'completed') ? 'completed' : 'in_progress') : 'not_started', summary: engagementData.length > 0 ? `${engagementData.length} engagement${engagementData.length > 1 ? 's' : ''} · ${engagementData[0]?.status}` : 'Commercial engagement and scope', detail: engagementData.length > 0 ? `${engagementData[0]?.name || 'Engagement'} · ${engagementData[0]?.engagement_type || ''}` : 'Services, pricing, and proposal', link: `/clients/${clientId}/engagements` },
    { id: 'transform', label: 'Transform', status: transformations.length > 0 ? (transformations.some(t => t.status === 'completed') ? 'completed' : 'in_progress') : getStageStatus(8), summary: transformations[0]?.title || 'Transformation plan', detail: transformations[0]?.duration ? `Duration: ${transformations[0].duration} • ${transformations[0].phases?.length || 0} phases` : 'Awaiting approval', link: `/clients/${clientId}/optimization` },
    { id: 'validate', label: 'Validate', status: getStageStatus(10), summary: 'Post-transformation validation', detail: 'Integrity and correctness verification', link: `/client-portal/${clientId}` },
    { id: 'outcome', label: 'Outcome', status: home.financial?.benefitRealization > 0 ? 'completed' : getStageStatus(11), summary: home.financial?.benefitRealization > 0 ? `${home.financial.benefitRealization}% benefit realized` : 'Measure expected vs actual', detail: home.financial?.realizedSavings > 0 ? `Expected: ${fmt(home.financial.expectedSavings || 0)} • Actual: ${fmt(home.financial.realizedSavings)}` : 'Awaiting measurement', link: `/clients/${clientId}/optimization` },
    { id: 'optimize', label: 'Optimize', status: home.optimization?.openFindings > 0 ? 'in_progress' : getStageStatus(11), summary: 'Continuous improvement', detail: home.optimization?.openFindings > 0 ? `${home.optimization.openFindings} optimization opportunities` : 'Monitoring active', link: `/clients/${clientId}/optimization` },
  ];

  const statusColor = (s: string) => s === 'completed' ? '#22c55e' : s === 'in_progress' ? '#3b82f6' : s === 'action_required' ? '#f59e0b' : s === 'not_enabled' ? '#475569' : '#334155';
  const statusIcon = (s: string) => s === 'completed' ? '✓' : s === 'in_progress' ? '●' : s === 'action_required' ? '!' : s === 'not_enabled' ? '−' : '○';
  const currentStage = stages.find(s => s.status === 'in_progress');

  // Next action determination
  let nextAction = 'Platform is monitoring your environment';
  if (home.requirements?.missing > 0) nextAction = `Complete ${home.requirements.missing} missing requirement(s)`;
  else if (home.connectors?.total > 0 && home.connectors.connected < home.connectors.total) nextAction = 'Validate remaining connectors';
  else if (home.problems?.critical > 0) nextAction = `Review ${home.problems.critical} critical problem(s)`;
  else if (home.gaps?.open > 0) nextAction = `Address ${home.gaps.open} open gap(s)`;

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Transformation Journey</h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Client: {clientId} • Stage: {lcStatus}</p>
        {clientId === 'demo-meridian-financial' && <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, padding: '2px 8px', background: '#1e40af', color: '#93c5fd', borderRadius: 4 }}>DEMO — Fictional Data</span>}
      </div>

      {/* Executive Summary Bar */}
      <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Overall Progress</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>{home.lifecycle?.progress || 0}%</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Problems</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: home.problems?.critical > 0 ? '#ef4444' : '#22c55e' }}>{home.problems?.total || 0}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Open Gaps</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>{home.gaps?.open || 0}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Realized Savings</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>{fmt(home.financial?.realizedSavings || 0)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Benefit Realization</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{home.financial?.benefitRealization || 0}%</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Next Action</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#38bdf8' }}>{nextAction}</div>
        </div>
      </div>

      {/* Journey Timeline */}
      <div style={{ position: 'relative' }}>
        {/* Vertical line */}
        <div style={{ position: 'absolute', left: 19, top: 0, bottom: 0, width: 2, background: '#334155' }} />

        {stages.map((stage, i) => {
          const disabled = isServiceDisabled(stage.id);
          const effectiveStatus = disabled ? 'not_enabled' : stage.status;
          return (
          <a key={stage.id} href={disabled ? '#' : stage.link} style={{ textDecoration: 'none', color: 'inherit', display: 'block', opacity: disabled ? 0.5 : 1 }}>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, position: 'relative', padding: '12px 16px', background: effectiveStatus === 'in_progress' ? '#1e293b' : 'transparent', borderRadius: 8, border: effectiveStatus === 'in_progress' ? '1px solid #3b82f6' : '1px solid transparent', transition: 'background 0.2s' }}>
              {/* Status Circle */}
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: statusColor(effectiveStatus), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0, zIndex: 1 }}>
                {statusIcon(effectiveStatus)}
              </div>

              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: effectiveStatus === 'not_started' || effectiveStatus === 'not_enabled' ? '#64748b' : '#f1f5f9' }}>{stage.label}</div>
                  {effectiveStatus === 'in_progress' && <span style={{ fontSize: 10, padding: '2px 8px', background: '#1e40af', borderRadius: 12, color: '#fff' }}>YOU ARE HERE</span>}
                  {disabled && <span style={{ fontSize: 10, padding: '2px 8px', background: '#334155', borderRadius: 12, color: '#94a3b8' }}>Not enabled</span>}
                  {stage.count != null && stage.count > 0 && !disabled && <span style={{ fontSize: 11, color: '#94a3b8' }}>{stage.count} items</span>}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{stage.summary}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{stage.detail}</div>
              </div>

              {/* Arrow */}
              <div style={{ color: '#334155', alignSelf: 'center', fontSize: 16 }}>→</div>
            </div>
          </a>
        ); })}
      </div>

      {/* Automation Summary */}
      <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, marginTop: 24 }}>
        <h3 style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>What AskABD Did Automatically</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {home.requirements?.total > 0 && <span style={{ fontSize: 11, padding: '3px 10px', background: '#0f172a', borderRadius: 12, color: '#22c55e' }}>✓ Onboarding information reused</span>}
          {discovery && <span style={{ fontSize: 11, padding: '3px 10px', background: '#0f172a', borderRadius: 12, color: '#22c55e' }}>✓ Discovered {discResources} resources</span>}
          {assessment && <span style={{ fontSize: 11, padding: '3px 10px', background: '#0f172a', borderRadius: 12, color: '#22c55e' }}>✓ Generated {assessFindings} assessment findings</span>}
          {problems.length > 0 && <span style={{ fontSize: 11, padding: '3px 10px', background: '#0f172a', borderRadius: 12, color: '#22c55e' }}>✓ {problems.length} problems identified</span>}
          {gaps.length > 0 && <span style={{ fontSize: 11, padding: '3px 10px', background: '#0f172a', borderRadius: 12, color: '#22c55e' }}>✓ {gaps.length} gaps auto-generated</span>}
          {home.financial?.realizedSavings > 0 && <span style={{ fontSize: 11, padding: '3px 10px', background: '#0f172a', borderRadius: 12, color: '#22c55e' }}>✓ Benefits measured: {fmt(home.financial.realizedSavings)}</span>}
          {home.optimization?.openFindings > 0 && <span style={{ fontSize: 11, padding: '3px 10px', background: '#0f172a', borderRadius: 12, color: '#22c55e' }}>✓ Optimization monitoring active</span>}
          {home.notifications?.unread > 0 && <span style={{ fontSize: 11, padding: '3px 10px', background: '#0f172a', borderRadius: 12, color: '#38bdf8' }}>🔔 {home.notifications.unread} notifications</span>}
        </div>
      </div>
    </div>
  );
}
