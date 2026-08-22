'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useId } from 'react';
import { Breadcrumb } from '../../../../components/breadcrumb';
import { EmptyState } from '../../../../components/empty-state';
import { Action } from '../../../../components/button';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

type ComplianceStatus = 'compliant' | 'partially_compliant' | 'non_compliant' | 'missing' | 'unknown' | 'needs_evidence' | 'not_applicable';
type EvidenceSourceType = 'discovery' | 'document' | 'assessment' | 'requirement' | 'connector' | 'database' | 'api' | 'client_provided' | 'staff_assessment';
type EvidenceVerificationStatus = 'verified' | 'client_provided' | 'staff_assessment' | 'needs_verification';

interface Gap { id: string; clientId: string; domain: string; category: string; title: string; description: string; currentState: string; targetState: string; gapDescription: string; businessImpact: string; technicalImpact: string; riskLevel: string; severity: string; priority: string; currentMaturity: number; targetMaturity: number; rootCause: string; relatedProblemId: string; relatedRequirementId?: string; confidence: string; sourceType: string; status: string; evidence: any[]; createdAt: string; complianceStatus: ComplianceStatus; complianceStatusReason: string; complianceClassifiedBy?: string; customerVisible: boolean; constraints: string; createdBy?: string; }
interface Summary { gaps: { total: number; critical: number; high: number; medium: number; low: number; open: number; resolved: number }; compliance?: Record<string, number>; avgMaturityGap: number; }
interface GapOption { id: string; gapId: string; name: string; description?: string; solutionType: string; investment?: number; annualSavings?: number; roiPercentage?: number; personDays?: number; complexity: string; strategicFit: string; score?: number; selected: boolean; status: string; }
interface Decision { id: string; gapId: string; selectedOptionId?: string; decisionMaker?: string; decisionDate: string; rationale?: string; status: string; }
interface GapEvidence { id: string; text: string; sourceType: EvidenceSourceType; verificationStatus: EvidenceVerificationStatus; reference?: string; addedBy?: string; createdAt: string; }

const severityColors: Record<string, string> = { critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-blue-100 text-blue-700' };
const domainLabels: Record<string, string> = { legacy: 'Legacy', cloud: 'Cloud', application: 'Application', database: 'Database', data: 'Data', infrastructure: 'Infrastructure', security: 'Security', compliance: 'Compliance', finops: 'FinOps', vendor: 'Vendor', performance: 'Performance', devops: 'DevOps', other: 'Other' };
const complianceLabels: Record<ComplianceStatus, { label: string; className: string }> = {
  compliant: { label: 'Compliant', className: 'bg-green-100 text-green-700' },
  partially_compliant: { label: 'Partially Compliant', className: 'bg-blue-100 text-blue-700' },
  non_compliant: { label: 'Non-Compliant', className: 'bg-red-100 text-red-700' },
  missing: { label: 'Missing', className: 'bg-red-100 text-red-700' },
  unknown: { label: 'Unknown', className: 'bg-gray-100 text-gray-500' },
  needs_evidence: { label: 'Needs Evidence', className: 'bg-amber-100 text-amber-700' },
  not_applicable: { label: 'Not Applicable', className: 'bg-gray-100 text-gray-400' },
};
const evidenceVerificationLabels: Record<EvidenceVerificationStatus, { label: string; className: string }> = {
  verified: { label: 'Verified', className: 'bg-green-100 text-green-700' },
  client_provided: { label: 'Client Provided', className: 'bg-blue-100 text-blue-700' },
  staff_assessment: { label: 'Staff Assessment', className: 'bg-indigo-100 text-indigo-700' },
  needs_verification: { label: 'Needs Verification', className: 'bg-amber-100 text-amber-700' },
};

export default function GapAnalysisPage() {
  const params = useParams();
  const clientId = params.clientId as string;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [selected, setSelected] = useState<Gap | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState({ domain: '', severity: '', status: '' });

  // Decision & Transformation state — real, backed by GapAnalysisService +
  // DecisionTransformationService (previously wired end-to-end but unreachable
  // from any UI, and blocked at the DB layer until migration 037 added the
  // oc_gaps/oc_gap_options/oc_decisions/oc_transformations tables it always
  // expected — see that migration's header comment).
  const [targetDraft, setTargetDraft] = useState('');
  const [savingTarget, setSavingTarget] = useState(false);
  const [options, setOptions] = useState<GapOption[] | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [optionForm, setOptionForm] = useState<{ name: string; solutionType: string; investment: string; annualSavings: string; personDays: string } | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<{ recommendation: string } | null>(null);
  const [decideBusy, setDecideBusy] = useState(false);
  // Inline rationale capture, not window.prompt() — a real UX improvement
  // (matches the target-state/option-form pattern already used on this page)
  // and avoids a native modal that real keyboard-driven and automated
  // workflows alike can't reliably interact with.
  const [decidingOption, setDecidingOption] = useState<{ id: string; name: string } | null>(null);
  const [rationaleDraft, setRationaleDraft] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const formId = useId();

  // Gap Analysis extension state — compliance classification, structured
  // evidence, risk acceptance (via the shared Approval Workflow Engine),
  // and the customer-visibility toggle.
  const [evidenceList, setEvidenceList] = useState<GapEvidence[] | null>(null);
  const [showComplianceForm, setShowComplianceForm] = useState(false);
  const [complianceDraft, setComplianceDraft] = useState<{ status: ComplianceStatus; reason: string }>({ status: 'unknown', reason: '' });
  const [savingCompliance, setSavingCompliance] = useState(false);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [evidenceDraft, setEvidenceDraft] = useState<{ text: string; sourceType: EvidenceSourceType; confidence: EvidenceVerificationStatus; reference: string }>({ text: '', sourceType: 'staff_assessment', confidence: 'needs_verification', reference: '' });
  const [savingEvidence, setSavingEvidence] = useState(false);
  const [showRiskForm, setShowRiskForm] = useState(false);
  const [riskRationale, setRiskRationale] = useState('');
  const [riskWorkflow, setRiskWorkflow] = useState<{ workflowId: string; status: string } | null>(null);
  const [requestingRisk, setRequestingRisk] = useState(false);
  const [decidingRisk, setDecidingRisk] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(null), 6000);
    return () => clearTimeout(t);
  }, [successMessage]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, gRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/clients/${clientId}/gaps/summary`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/gaps?${new URLSearchParams(Object.fromEntries(Object.entries(filter).filter(([,v]) => v)))}`),
      ]);
      if (sRes.ok) setSummary(await sRes.json());
      if (gRes.ok) { const d = await gRes.json(); setGaps(d.gaps || []); }
    } catch {}
    setLoading(false);
  }, [clientId, filter]);

  useEffect(() => { load(); }, [load]);

  const loadGapExtras = useCallback(async (gapId: string) => {
    setOptions(null); setDecision(null); setCompareResult(null); setOptionForm(null); setDecidingOption(null); setRationaleDraft('');
    setEvidenceList(null); setRiskWorkflow(null); setShowComplianceForm(false); setShowEvidenceForm(false); setShowRiskForm(false);
    try {
      const [oRes, dRes, eRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/gaps/${gapId}/options`),
        fetch(`${API}/api/v1/oc/gaps/${gapId}/decision`),
        fetch(`${API}/api/v1/oc/gaps/${gapId}/evidence`),
      ]);
      if (oRes.ok) { const d = await oRes.json(); setOptions(d.options || []); }
      if (dRes.ok) { const d = await dRes.json(); setDecision(d?.id ? d : null); }
      if (eRes.ok) { const d = await eRes.json(); setEvidenceList(d.evidence || []); }
    } catch { setOptions([]); setEvidenceList([]); }
  }, []);

  function selectGap(g: Gap) {
    setSelected(g);
    setTargetDraft(g.targetState || '');
    setComplianceDraft({ status: g.complianceStatus || 'unknown', reason: '' });
    loadGapExtras(g.id);
  }

  async function saveCompliance() {
    if (!selected || !complianceDraft.reason.trim()) return;
    setSavingCompliance(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/gaps/${selected.id}/compliance`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: complianceDraft.status, reason: complianceDraft.reason }),
      });
      if (res.ok) { const g = await res.json(); setSelected(g); setGaps(prev => prev.map(x => x.id === g.id ? g : x)); setShowComplianceForm(false); setComplianceDraft({ status: g.complianceStatus, reason: '' }); }
    } catch {}
    setSavingCompliance(false);
  }

  async function addEvidence() {
    if (!selected || !evidenceDraft.text.trim()) return;
    setSavingEvidence(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/gaps/${selected.id}/evidence`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: evidenceDraft.text, sourceType: evidenceDraft.sourceType, verificationStatus: evidenceDraft.confidence, reference: evidenceDraft.reference || undefined }),
      });
      if (res.ok) { setEvidenceDraft({ text: '', sourceType: 'staff_assessment', confidence: 'needs_verification', reference: '' }); setShowEvidenceForm(false); loadGapExtras(selected.id); }
    } catch {}
    setSavingEvidence(false);
  }

  async function requestRiskAcceptance() {
    if (!selected || !riskRationale.trim()) return;
    setRequestingRisk(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/gaps/${selected.id}/risk-acceptance/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rationale: riskRationale }),
      });
      if (res.ok) { const w = await res.json(); setRiskWorkflow(w); setShowRiskForm(false); }
    } catch {}
    setRequestingRisk(false);
  }

  async function decideRisk(decision: 'approve' | 'reject') {
    if (!riskWorkflow) return;
    setDecidingRisk(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/gaps/risk-acceptance/${riskWorkflow.workflowId}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        const d = await res.json();
        setRiskWorkflow(null); setRiskRationale('');
        if (d.gap) { setSelected(d.gap); setGaps(prev => prev.map((x: Gap) => x.id === d.gap.id ? d.gap : x)); }
        setSuccessMessage(decision === 'approve' ? 'Risk acceptance approved — gap status updated.' : 'Risk acceptance rejected.');
      }
    } catch {}
    setDecidingRisk(false);
  }

  async function toggleCustomerVisibility() {
    if (!selected) return;
    setTogglingVisibility(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/gaps/${selected.id}/customer-visibility`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visible: !selected.customerVisible }),
      });
      if (res.ok) { const g = await res.json(); setSelected(g); setGaps(prev => prev.map(x => x.id === g.id ? g : x)); }
    } catch {}
    setTogglingVisibility(false);
  }

  async function saveTarget() {
    if (!selected || !targetDraft.trim()) return;
    setSavingTarget(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/gaps/${selected.id}/target`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetState: targetDraft }),
      });
      if (res.ok) { const g = await res.json(); setSelected(g); setGaps(prev => prev.map(x => x.id === g.id ? g : x)); }
    } catch {}
    setSavingTarget(false);
  }

  async function addOption() {
    if (!selected || !optionForm?.name.trim()) return;
    try {
      const res = await fetch(`${API}/api/v1/oc/gaps/${selected.id}/options`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: optionForm.name, solutionType: optionForm.solutionType || 'general',
          investment: optionForm.investment ? Number(optionForm.investment) : undefined,
          annualSavings: optionForm.annualSavings ? Number(optionForm.annualSavings) : undefined,
          personDays: optionForm.personDays ? Number(optionForm.personDays) : undefined,
        }),
      });
      if (res.ok) { setOptionForm(null); loadGapExtras(selected.id); }
    } catch {}
  }

  async function runCompare() {
    if (!selected) return;
    setComparing(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/gaps/${selected.id}/compare`);
      if (res.ok) {
        const d = await res.json();
        setCompareResult({ recommendation: d.recommendation });
        setOptions(d.options || []);
      }
    } catch {}
    setComparing(false);
  }

  async function decide(optionId: string, rationale: string) {
    if (!selected) return;
    setDecideBusy(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/gaps/${selected.id}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedOptionId: optionId, rationale }),
      });
      if (res.ok) { const d = await res.json(); setDecision(d); setDecidingOption(null); setRationaleDraft(''); loadGapExtras(selected.id); load(); }
    } catch {}
    setDecideBusy(false);
  }

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/gaps/generate`, { method: 'POST' });
      if (res.ok) {
        const r = await res.json();
        setSuccessMessage(
          r.generated > 0
            ? `${r.generated} new gap${r.generated === 1 ? '' : 's'} created from the Problem Universe${r.existing > 0 ? ` (${r.existing} already existed and were skipped).` : '.'}`
            : `No new gaps to create — all ${r.existing} problem${r.existing === 1 ? '' : 's'} already ${r.existing === 1 ? 'has' : 'have'} a matching gap.`
        );
        load();
      }
    } catch {}
    setGenerating(false);
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Clients', href: '/clients' }, { label: clientId, href: `/clients/${clientId}/lifecycle` }, { label: 'Gap Analysis' }]} />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gap Analysis</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            A Gap is the real distance between where this client is today and where they need to be —
            each one comes from a real problem found during Assessment. For each gap: define the target
            state, weigh your options, and record a decision. Approved decisions become Transformation plans.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Action variant="primary" onClick={generate} loading={generating} className="!bg-purple-600 hover:!bg-purple-700">
            ⚡ Generate from Problems
          </Action>
          <Action variant="secondary" onClick={load}>↻ Refresh</Action>
        </div>
      </div>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
          <span className="text-green-600" aria-hidden="true">✓</span>
          <p className="text-xs text-green-800">{successMessage}</p>
        </div>
      )}

      {/* Summary — every number here comes from a real oc_gaps query, never fabricated. */}
      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <SC label="Total Gaps" value={summary.gaps.total} color="text-gray-900" />
            <SC label="Critical" value={summary.gaps.critical} color="text-red-600" />
            <SC label="High" value={summary.gaps.high} color="text-orange-600" />
            <SC label="Open" value={summary.gaps.open} color="text-purple-600" />
            <SC label="Resolved" value={summary.gaps.resolved} color="text-green-600" />
            <SC label="Avg Maturity Gap" value={summary.avgMaturityGap.toFixed(1)} color="text-blue-600" />
            <SC label="Medium" value={summary.gaps.medium} color="text-yellow-600" />
          </div>
          {summary.compliance && (
            <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
              <SC label="Compliant" value={summary.compliance.compliant ?? 0} color="text-green-600" />
              <SC label="Partial" value={summary.compliance.partiallyCompliant ?? 0} color="text-blue-600" />
              <SC label="Non-Compliant" value={summary.compliance.nonCompliant ?? 0} color="text-red-600" />
              <SC label="Missing" value={summary.compliance.missing ?? 0} color="text-red-500" />
              <SC label="Needs Evidence" value={summary.compliance.needsEvidence ?? 0} color="text-amber-600" />
              <SC label="Unknown" value={summary.compliance.unknown ?? 0} color="text-gray-500" />
              <SC label="Not Applicable" value={summary.compliance.notApplicable ?? 0} color="text-gray-400" />
            </div>
          )}
        </>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select value={filter.domain} onChange={e => setFilter({...filter, domain: e.target.value})} className="text-xs border rounded-lg px-2 py-1.5"><option value="">All Domains</option>{Object.entries(domainLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select value={filter.severity} onChange={e => setFilter({...filter, severity: e.target.value})} className="text-xs border rounded-lg px-2 py-1.5"><option value="">All Severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} className="text-xs border rounded-lg px-2 py-1.5"><option value="">All Statuses</option><option value="identified">Identified</option><option value="validated">Validated</option><option value="target_defined">Target Defined</option><option value="resolved">Resolved</option></select>
      </div>

      {/* Content — real root cause of the mobile overflow found during the
          2026-08-22 responsive audit: a bare `grid lg:grid-cols-3` has no
          explicit column track below the lg breakpoint, so CSS Grid's
          implicit auto-sized column let long card content (badges, text)
          push the grid wider than the viewport instead of wrapping/shrinking
          — unlike Flexbox, Grid's default track sizing respects children's
          max-content width. Explicit `grid-cols-1` gives that column a real
          `minmax(0, 1fr)` track, which is what actually constrains it. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-2">
          {loading && <p className="text-sm text-gray-400 text-center py-8">Loading gaps...</p>}
          {!loading && gaps.length === 0 && (
            <EmptyState
              icon="🎯"
              title="No gaps identified yet"
              explanation="Gaps are generated from real problems found during Assessment. If Assessment hasn't run yet, start there first — otherwise, click Generate from Problems above to create gaps from what's already been found."
              action={<Link href={`/clients/${clientId}/problems`} className="text-xs text-purple-600 font-medium hover:underline">View Problem Universe →</Link>}
            />
          )}
          {gaps.map(g => (
            <button key={g.id} onClick={() => selectGap(g)} className={`w-full text-left bg-white rounded-xl border p-4 hover:border-purple-300 transition ${selected?.id === g.id ? 'border-purple-500 ring-1 ring-purple-200' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* flex-wrap — found during the 2026-08-22 responsive audit:
                      3 unwrapped badges forced this whole card past the
                      viewport edge on a 375px screen (flex children default
                      to min-width:auto, so min-w-0 on the ancestor alone
                      doesn't stop it). */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${severityColors[g.severity] || 'bg-gray-100'}`}>{g.severity?.toUpperCase()}</span>
                    <span className="text-[9px] text-gray-400">{domainLabels[g.domain] || g.domain}</span>
                    <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">Maturity: {g.currentMaturity}→{g.targetMaturity}</span>
                    {g.complianceStatus && g.complianceStatus !== 'unknown' && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${complianceLabels[g.complianceStatus]?.className || 'bg-gray-100'}`}>{complianceLabels[g.complianceStatus]?.label}</span>
                    )}
                    {g.customerVisible && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">CUSTOMER</span>}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 truncate">{g.title}</p>
                  {g.currentState && <p className="text-[10px] text-gray-500 mt-0.5 truncate">Current: {g.currentState}</p>}
                </div>
                <span className="text-[9px] text-gray-400 shrink-0">{g.status}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="space-y-4">
          {selected ? (
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-sm text-gray-900 mb-3">{selected.title}</h3>
              <div className="space-y-3 text-xs">
                <Section title="Current State" value={selected.currentState || 'Identified from assessment'} />
                {selected.targetState ? (
                  <Section title="Target State" value={selected.targetState} />
                ) : (
                  <div>
                    <label htmlFor={`${formId}-target`} className="block text-[9px] font-medium text-gray-500 mb-1">
                      Target State <span className="text-orange-600">— not yet defined</span>
                    </label>
                    <textarea id={`${formId}-target`} value={targetDraft} onChange={e => setTargetDraft(e.target.value)}
                      placeholder="e.g. All tables with frequent queries have appropriate indexes, verified before migration."
                      className="w-full text-[10px] border rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-purple-500" rows={2} />
                    <p className="text-[9px] text-gray-400 mt-0.5">Describe the desired end state — what "fixed" looks like for this gap.</p>
                    <button onClick={saveTarget} disabled={savingTarget || !targetDraft.trim()} className="mt-1 text-[10px] font-semibold text-purple-600 hover:text-purple-800 disabled:opacity-50">
                      {savingTarget ? 'Saving…' : 'Define Target State →'}
                    </button>
                    {!targetDraft.trim() && <p className="text-[9px] text-gray-400 mt-0.5">Describe the target state to continue.</p>}
                  </div>
                )}
                <Section title="Gap" value={selected.gapDescription || selected.description || '—'} />
                <Section title="Business Impact" value={selected.businessImpact} />
                <Section title="Technical Impact" value={selected.technicalImpact} />
                <Section title="Root Cause" value={selected.rootCause} />
                <div className="pt-2 border-t">
                  <p className="text-[9px] text-gray-500 mb-1">Maturity</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-orange-600">{selected.currentMaturity}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-xs font-bold text-green-600">{selected.targetMaturity}</span>
                    <span className="text-[9px] text-gray-400 ml-2">(Gap: {selected.targetMaturity - selected.currentMaturity})</span>
                  </div>
                </div>
                <div className="pt-2 border-t space-y-1">
                  <R label="Domain" value={domainLabels[selected.domain] || selected.domain} />
                  <R label="Severity" value={selected.severity} />
                  <R label="Risk" value={selected.riskLevel} />
                  <R label="Confidence" value={selected.confidence} />
                  <R label="Source" value={selected.sourceType} />
                  <R label="Status" value={selected.status} />
                  {selected.createdBy && <R label="Created By" value={selected.createdBy} />}
                </div>
                {(selected.relatedProblemId || selected.relatedRequirementId) && (
                  <div className="pt-2 border-t flex flex-wrap gap-3">
                    {selected.relatedProblemId && <Link href={`/clients/${clientId}/problems`} className="text-[10px] text-purple-600 font-medium hover:underline">View Related Problem →</Link>}
                    {selected.relatedRequirementId && <Link href={`/clients/${clientId}/business-requirements`} className="text-[10px] text-purple-600 font-medium hover:underline">View Related Requirement →</Link>}
                  </div>
                )}

                {/* Compliance classification — real, staff-attributed, required reason. */}
                <div className="pt-3 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] font-bold text-gray-700 uppercase">Compliance</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${complianceLabels[selected.complianceStatus]?.className || 'bg-gray-100'}`}>{complianceLabels[selected.complianceStatus]?.label || 'Unknown'}</span>
                  </div>
                  {selected.complianceStatusReason && (
                    <p className="text-[10px] text-gray-600 mb-1.5">Why: {selected.complianceStatusReason}{selected.complianceClassifiedBy ? ` — ${selected.complianceClassifiedBy}` : ''}</p>
                  )}
                  {!showComplianceForm ? (
                    <button onClick={() => setShowComplianceForm(true)} className="text-[10px] font-semibold text-purple-600 hover:text-purple-800">Reclassify →</button>
                  ) : (
                    <div className="space-y-1.5">
                      <select value={complianceDraft.status} onChange={e => setComplianceDraft(d => ({ ...d, status: e.target.value as ComplianceStatus }))} className="w-full text-[10px] border rounded px-2 py-1">
                        {Object.entries(complianceLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <textarea value={complianceDraft.reason} onChange={e => setComplianceDraft(d => ({ ...d, reason: e.target.value }))} placeholder="Why this status? (required)" className="w-full text-[10px] border rounded p-2" rows={2} />
                      <div className="flex gap-2">
                        <button onClick={saveCompliance} disabled={savingCompliance || !complianceDraft.reason.trim()} className="text-[9px] font-semibold text-white bg-purple-600 hover:bg-purple-700 px-2 py-1 rounded disabled:opacity-50">{savingCompliance ? 'Saving…' : 'Save Classification'}</button>
                        <button onClick={() => setShowComplianceForm(false)} className="text-[9px] text-gray-500">Cancel</button>
                      </div>
                      {!complianceDraft.reason.trim() && <p className="text-[9px] text-amber-600">A reason is required — explain why this status applies.</p>}
                    </div>
                  )}
                </div>

                {/* Evidence — real, source-classified, never fabricated. */}
                <div className="pt-3 border-t">
                  <p className="text-[9px] font-bold text-gray-700 uppercase mb-2">Evidence</p>
                  {evidenceList === null ? (
                    <p className="text-[10px] text-gray-400">Loading…</p>
                  ) : evidenceList.length === 0 ? (
                    <p className="text-[10px] text-gray-400 mb-2">No evidence recorded yet.</p>
                  ) : (
                    <div className="space-y-1.5 mb-2">
                      {evidenceList.map(e => (
                        <div key={e.id} className="border rounded-lg p-2">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[9px] text-gray-400">{e.sourceType.replace('_', ' ')}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${evidenceVerificationLabels[e.verificationStatus]?.className}`}>{evidenceVerificationLabels[e.verificationStatus]?.label}</span>
                          </div>
                          <p className="text-[10px] text-gray-700">{e.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {!showEvidenceForm ? (
                    <button onClick={() => setShowEvidenceForm(true)} className="text-[10px] font-semibold text-purple-600 hover:text-purple-800">+ Add Evidence</button>
                  ) : (
                    <div className="space-y-1.5 border rounded-lg p-2.5 bg-gray-50">
                      <textarea value={evidenceDraft.text} onChange={e => setEvidenceDraft(d => ({ ...d, text: e.target.value }))} placeholder="What is the evidence?" className="w-full text-[10px] border rounded p-2" rows={2} />
                      <div className="grid grid-cols-2 gap-1.5">
                        <select value={evidenceDraft.sourceType} onChange={e => setEvidenceDraft(d => ({ ...d, sourceType: e.target.value as EvidenceSourceType }))} className="text-[10px] border rounded px-2 py-1">
                          {(['discovery', 'document', 'assessment', 'requirement', 'connector', 'database', 'api', 'staff_assessment'] as EvidenceSourceType[]).map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                        </select>
                        <select value={evidenceDraft.confidence} onChange={e => setEvidenceDraft(d => ({ ...d, confidence: e.target.value as EvidenceVerificationStatus }))} className="text-[10px] border rounded px-2 py-1">
                          {(['needs_verification', 'staff_assessment', 'verified'] as EvidenceVerificationStatus[]).map(v => <option key={v} value={v}>{evidenceVerificationLabels[v].label}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={addEvidence} disabled={savingEvidence || !evidenceDraft.text.trim()} className="text-[9px] font-semibold text-white bg-purple-600 hover:bg-purple-700 px-2 py-1 rounded disabled:opacity-50">{savingEvidence ? 'Saving…' : 'Save Evidence'}</button>
                        <button onClick={() => setShowEvidenceForm(false)} className="text-[9px] text-gray-500">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Risk acceptance — gated through the real Approval Workflow Engine, never a bare status flip. */}
                {selected.status !== 'accepted_risk' && (
                  <div className="pt-3 border-t">
                    <p className="text-[9px] font-bold text-gray-700 uppercase mb-2">Risk Acceptance</p>
                    {riskWorkflow ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                        <p className="text-[10px] text-amber-800 mb-2">A risk-acceptance request is pending approval.</p>
                        <div className="flex gap-2">
                          <button onClick={() => decideRisk('approve')} disabled={decidingRisk} className="text-[9px] font-semibold text-white bg-green-600 hover:bg-green-700 px-2 py-1 rounded disabled:opacity-50">Approve</button>
                          <button onClick={() => decideRisk('reject')} disabled={decidingRisk} className="text-[9px] font-semibold text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded disabled:opacity-50">Reject</button>
                        </div>
                      </div>
                    ) : !showRiskForm ? (
                      <button onClick={() => setShowRiskForm(true)} className="text-[10px] font-semibold text-gray-600 hover:text-gray-800">Request Risk Acceptance →</button>
                    ) : (
                      <div className="space-y-1.5">
                        <textarea value={riskRationale} onChange={e => setRiskRationale(e.target.value)} placeholder="Rationale for accepting this risk (required)" className="w-full text-[10px] border rounded p-2" rows={2} />
                        <div className="flex gap-2">
                          <button onClick={requestRiskAcceptance} disabled={requestingRisk || !riskRationale.trim()} className="text-[9px] font-semibold text-white bg-purple-600 hover:bg-purple-700 px-2 py-1 rounded disabled:opacity-50">{requestingRisk ? 'Requesting…' : 'Submit Request'}</button>
                          <button onClick={() => setShowRiskForm(false)} className="text-[9px] text-gray-500">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Customer visibility toggle — default-closed. */}
                <div className="pt-3 border-t flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-bold text-gray-700 uppercase">Customer Visibility</p>
                    <p className="text-[9px] text-gray-400">{selected.customerVisible ? 'Visible in the client portal' : 'Internal only — staff-only'}</p>
                  </div>
                  <button onClick={toggleCustomerVisibility} disabled={togglingVisibility} className={`text-[9px] font-semibold px-2 py-1 rounded disabled:opacity-50 ${selected.customerVisible ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                    {togglingVisibility ? 'Saving…' : selected.customerVisible ? 'Make Internal' : 'Make Customer-Visible'}
                  </button>
                </div>

                {/* Decision — real, backed by DecisionTransformationService.
                    Once a decision exists, this replaces Options/Compare with
                    the real recorded outcome (actor, timestamp, rationale). */}
                <div className="pt-3 border-t">
                  <p className="text-[9px] font-bold text-gray-700 uppercase mb-2">Options & Decision</p>
                  {decision ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-2.5">
                      <p className="text-[10px] font-semibold text-green-800">✓ Decision recorded</p>
                      <p className="text-[9px] text-gray-600 mt-1">Performed by {decision.decisionMaker || 'unknown-staff'} on {new Date(decision.decisionDate).toLocaleString()}</p>
                      {decision.rationale && <p className="text-[9px] text-gray-700 mt-1">"{decision.rationale}"</p>}
                      <p className="text-[9px] text-gray-500 mt-1">Status: {decision.status}</p>
                      <Link href={`/clients/${clientId}/transformations`} className="mt-2 inline-block text-[10px] font-semibold text-purple-600 hover:text-purple-800">
                        Plan the Transformation →
                      </Link>
                    </div>
                  ) : options === null ? (
                    <p className="text-[10px] text-gray-400">Loading options…</p>
                  ) : (
                    <>
                      {options.length === 0 && <p className="text-[10px] text-gray-400 mb-2">No options defined yet.</p>}
                      {options.map(o => (
                        <div key={o.id} className="border rounded-lg p-2 mb-1.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-semibold text-gray-800">{o.name}</p>
                            {o.score != null && <span className="text-[9px] font-bold text-indigo-600">{o.score}/100</span>}
                          </div>
                          <p className="text-[9px] text-gray-500">{o.solutionType}{o.investment ? ` · $${o.investment.toLocaleString()} investment` : ''}{o.roiPercentage ? ` · ${o.roiPercentage.toFixed(0)}% ROI` : ''}</p>
                          {decidingOption?.id === o.id ? (
                            <div className="mt-1.5 space-y-1">
                              <textarea value={rationaleDraft} onChange={e => setRationaleDraft(e.target.value)} placeholder={`Rationale for selecting "${o.name}"…`} className="w-full text-[10px] border rounded px-2 py-1" rows={2} autoFocus />
                              <div className="flex gap-2">
                                <button onClick={() => decide(o.id, rationaleDraft)} disabled={decideBusy} className="text-[9px] font-semibold text-white bg-purple-600 hover:bg-purple-700 px-2 py-1 rounded disabled:opacity-50">{decideBusy ? 'Recording…' : 'Confirm Decision'}</button>
                                <button onClick={() => { setDecidingOption(null); setRationaleDraft(''); }} className="text-[9px] text-gray-500">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => { setDecidingOption({ id: o.id, name: o.name }); setRationaleDraft(''); }} className="mt-1 text-[9px] font-semibold text-purple-600 hover:text-purple-800">Select & Decide →</button>
                          )}
                        </div>
                      ))}
                      {compareResult && <p className="text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded p-1.5 mt-1">{compareResult.recommendation}</p>}
                      <div className="flex gap-2 mt-2">
                        {options.length > 1 && <button onClick={runCompare} disabled={comparing} className="text-[9px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50">{comparing ? 'Comparing…' : '⚖ Compare Options'}</button>}
                        <button onClick={() => setOptionForm({ name: '', solutionType: 'general', investment: '', annualSavings: '', personDays: '' })} className="text-[9px] font-semibold text-gray-600 hover:text-gray-800">+ Add Option</button>
                      </div>
                      {optionForm && (
                        <div className="mt-2 border rounded-lg p-2.5 space-y-2 bg-gray-50">
                          <p className="text-[9px] text-gray-500">Describe one possible way to solve this gap. Add a second option later to compare them.</p>
                          <div>
                            <label htmlFor={`${formId}-opt-name`} className="block text-[9px] font-medium text-gray-600 mb-0.5">
                              Option Name<span className="text-red-500 ml-0.5" aria-label="required">*</span>
                            </label>
                            <input id={`${formId}-opt-name`} value={optionForm.name} onChange={e => setOptionForm({ ...optionForm, name: e.target.value })}
                              placeholder="e.g. Migrate to a managed service" required aria-required="true"
                              className="w-full text-[10px] border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <div>
                              <label htmlFor={`${formId}-opt-inv`} className="block text-[9px] font-medium text-gray-600 mb-0.5">Investment ($)</label>
                              <input id={`${formId}-opt-inv`} inputMode="decimal" value={optionForm.investment} onChange={e => setOptionForm({ ...optionForm, investment: e.target.value })} placeholder="e.g. 5000" className="w-full text-[10px] border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            </div>
                            <div>
                              <label htmlFor={`${formId}-opt-sav`} className="block text-[9px] font-medium text-gray-600 mb-0.5">Savings ($/yr)</label>
                              <input id={`${formId}-opt-sav`} inputMode="decimal" value={optionForm.annualSavings} onChange={e => setOptionForm({ ...optionForm, annualSavings: e.target.value })} placeholder="e.g. 15000" className="w-full text-[10px] border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            </div>
                            <div>
                              <label htmlFor={`${formId}-opt-days`} className="block text-[9px] font-medium text-gray-600 mb-0.5">Effort (person-days)</label>
                              <input id={`${formId}-opt-days`} inputMode="decimal" value={optionForm.personDays} onChange={e => setOptionForm({ ...optionForm, personDays: e.target.value })} placeholder="e.g. 4" className="w-full text-[10px] border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            </div>
                          </div>
                          <p className="text-[9px] text-gray-400">All amounts optional, but adding them lets AskABD rank your options by real ROI when you compare.</p>
                          <div className="flex items-center gap-2">
                            <button onClick={addOption} disabled={!optionForm.name.trim()} className="text-[9px] font-semibold text-white bg-purple-600 hover:bg-purple-700 px-2 py-1 rounded disabled:opacity-50">Save Option</button>
                            <button onClick={() => setOptionForm(null)} className="text-[9px] text-gray-500">Cancel</button>
                            {!optionForm.name.trim() && <span className="text-[9px] text-amber-600">Enter a name to save.</span>}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">Select a gap to view current/target state, maturity, and impact analysis.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SC({ label, value, color }: { label: string; value: string | number; color: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color}`}>{value}</p><p className="text-[10px] text-gray-500">{label}</p></div>;
}
function Section({ title, value, warn }: { title: string; value?: string; warn?: boolean }) {
  if (!value) return null;
  return <div><p className="text-[9px] font-medium text-gray-500">{title}</p><p className={`text-[10px] ${warn ? 'text-orange-600 italic' : 'text-gray-700'}`}>{value}</p></div>;
}
function R({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-medium text-gray-800">{value}</span></div>;
}
