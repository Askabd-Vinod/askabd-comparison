'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface JourneyStage {
  num: string; id: string; label: string;
  problem: string; action: string; value: string;
  inputs: string[]; outputs: string[];
  automation: 'automatic' | 'askabd-assisted' | 'client-action' | 'external-dependency';
  effort: 'low' | 'medium' | 'high';
  clientProvides: string[]; askabdDoes: string[]; askabdProduces: string[];
  link?: string; capabilityId?: string;
}

const STAGES: JourneyStage[] = [
  { num: '01', id: 'onboard', label: 'Onboard',
    problem: 'Organizations often begin transformation without structured understanding of their goals, environment and requirements.',
    action: 'Captures organization profile, business objectives, contacts, requirements and engagement context.',
    value: 'Creates a structured starting point and prevents work from beginning with incomplete information.',
    inputs: ['Organization information', 'Business owner', 'Requirements', 'Objectives', 'Environment details'],
    outputs: ['Client profile', 'Lifecycle state', 'Requirement baseline', 'Audit history'],
    automation: 'askabd-assisted', effort: 'low',
    clientProvides: ['Organization details', 'Business owner verification', 'Initial requirements'],
    askabdDoes: ['Requirement validation', 'OTP delivery', 'Readiness evaluation', 'Lifecycle management'],
    askabdProduces: ['Client record', 'Verification result', 'Lifecycle transition', 'Audit trail'],
    link: '/clients/onboard', capabilityId: 'cap-client-onboarding' },
  { num: '02', id: 'discover', label: 'Discover',
    problem: 'Organizations often lack a complete, reliable view of their applications, infrastructure, databases and dependencies.',
    action: 'Discovers technology resources and relationships using configured connectors and discovery services.',
    value: 'Creates a current-state view as the factual foundation for assessment and decisions.',
    inputs: ['Connector configuration', 'Environment info', 'Discovery scope', 'Authorization'],
    outputs: ['Resources', 'Applications', 'Infrastructure', 'Databases', 'Dependencies', 'Evidence'],
    automation: 'askabd-assisted', effort: 'medium',
    clientProvides: ['Connector credentials', 'Scope authorization'],
    askabdDoes: ['Resource scanning', 'Relationship mapping', 'Metadata extraction'],
    askabdProduces: ['Discovery run', 'Resource inventory', 'Dependency map', 'Audit events'],
    link: '/clients/demo-meridian-financial/connectors', capabilityId: 'cap-discovery-engine' },
  { num: '03', id: 'assess', label: 'Assess',
    problem: 'Knowing what exists is insufficient. Organizations need to know what is healthy, risky, outdated or expensive.',
    action: 'Analyzes discovered information and produces findings, risk indicators and assessment results.',
    value: 'Helps management understand where attention is required and which issues to prioritize.',
    inputs: ['Discovery results', 'Environment info', 'Assessment criteria'],
    outputs: ['Findings', 'Risk scores', 'Health indicators', 'Evidence'],
    automation: 'automatic', effort: 'low',
    clientProvides: ['Assessment scope approval'],
    askabdDoes: ['Risk analysis', 'Health scoring', 'Finding generation', 'Evidence linking'],
    askabdProduces: ['Assessment report', 'Risk score', 'Findings list', 'Audit events'],
    link: '/clients/demo-meridian-financial/readiness', capabilityId: 'cap-assessment-engine' },
  { num: '04', id: 'identify', label: 'Identify',
    problem: 'Organizations may have hundreds of observations but cannot determine which represent actual business problems.',
    action: 'Converts technical observations into structured problems, gaps, risks and opportunities.',
    value: 'Turns scattered technical information into an actionable problem inventory.',
    inputs: ['Assessment findings', 'Discovery evidence', 'Client context'],
    outputs: ['Problem catalogue', 'Risk classification', 'Gap classification', 'Priority', 'Ownership'],
    automation: 'askabd-assisted', effort: 'low',
    clientProvides: ['Problem confirmation', 'Priority input'],
    askabdDoes: ['Problem detection', 'Classification', 'Severity assessment', 'Evidence linking'],
    askabdProduces: ['Problem records', 'Gap records', 'Priority mapping', 'Audit trail'],
    link: '/clients/demo-meridian-financial/problems', capabilityId: 'cap-problem-universe' },
  { num: '05', id: 'analyze', label: 'Analyze',
    problem: 'Fixing symptoms without understanding root causes creates additional cost and risk.',
    action: 'Analyzes relationships, dependencies, gaps, maturity and contributing factors.',
    value: 'Helps clients understand WHY a problem exists, not just that it exists.',
    inputs: ['Problems', 'Gaps', 'Discovery data', 'Assessment findings'],
    outputs: ['Root-cause analysis', 'Dependencies', 'Gap analysis', 'Maturity information'],
    automation: 'askabd-assisted', effort: 'medium',
    clientProvides: ['Domain knowledge', 'Target state definition'],
    askabdDoes: ['Dependency analysis', 'Maturity scoring', 'Gap quantification'],
    askabdProduces: ['Gap analysis', 'Maturity scores', 'Relationship map', 'Evidence'],
    link: '/clients/demo-meridian-financial/gaps', capabilityId: 'cap-gap-analysis' },
  { num: '06', id: 'quantify', label: 'Quantify',
    problem: 'Technical problems are difficult for executives to prioritize when financial impact is unclear.',
    action: 'Converts problems and opportunities into measurable financial, operational and effort estimates where evidence exists.',
    value: 'Creates a financial and operational basis for prioritization.',
    inputs: ['Problems', 'Gaps', 'Assessment data', 'Client financial context'],
    outputs: ['Cost estimates', 'Savings potential', 'Effort estimates', 'ROI projections'],
    automation: 'askabd-assisted', effort: 'medium',
    clientProvides: ['Financial context', 'Budget information', 'Business priorities'],
    askabdDoes: ['Impact calculation', 'Effort estimation', 'Value projection'],
    askabdProduces: ['Financial estimates', 'Effort estimates', 'ROI analysis', 'Evidence'],
    link: '/clients/demo-meridian-financial/financial', capabilityId: 'cap-financial-impact' },
  { num: '07', id: 'compare', label: 'Compare',
    problem: 'Organizations frequently have multiple technology, vendor, migration or transformation options.',
    action: 'Provides structured comparison of available options using defined criteria.',
    value: 'Reduces subjective decision-making and makes trade-offs visible.',
    inputs: ['Options', 'Criteria', 'Financial estimates', 'Risk assessment'],
    outputs: ['Option comparison', 'Scoring', 'Trade-offs', 'Recommendation inputs'],
    automation: 'askabd-assisted', effort: 'medium',
    clientProvides: ['Options to evaluate', 'Weighting criteria'],
    askabdDoes: ['Structured comparison', 'Scoring', 'Trade-off analysis'],
    askabdProduces: ['Comparison matrix', 'Scores', 'Evidence-based ranking'],
    capabilityId: 'cap-decision-framework' },
  { num: '08', id: 'decide', label: 'Decide',
    problem: 'Decisions are difficult to defend when evidence and trade-offs are scattered across documents.',
    action: 'Brings evidence, analysis, impact and comparisons together to support a documented decision.',
    value: 'Creates a defensible, traceable transformation decision.',
    inputs: ['Comparison results', 'Financial impact', 'Risk assessment', 'Stakeholder input'],
    outputs: ['Decision record', 'Selected option', 'Rationale', 'Approvals', 'Audit trail'],
    automation: 'client-action', effort: 'medium',
    clientProvides: ['Decision', 'Approval', 'Rationale'],
    askabdDoes: ['Evidence aggregation', 'Decision recording', 'Audit trail creation'],
    askabdProduces: ['Decision record', 'Approval chain', 'Audit events'],
    capabilityId: 'cap-decision-framework' },
  { num: '09', id: 'transform', label: 'Transform',
    problem: 'Good decisions fail when execution is poorly controlled.',
    action: 'Coordinates transformation activities using supported workflows, migration plans and execution controls.',
    value: 'Moves the organization from decision to controlled execution.',
    inputs: ['Decision', 'Transformation plan', 'Resources', 'Timeline'],
    outputs: ['Execution records', 'Migration status', 'Rollback info', 'Audit events'],
    automation: 'askabd-assisted', effort: 'high',
    clientProvides: ['Execution approval', 'Resource allocation', 'Scheduling'],
    askabdDoes: ['Plan generation', 'Step coordination', 'Progress tracking', 'Rollback support'],
    askabdProduces: ['Transformation plan', 'Execution log', 'Status updates', 'Audit trail'],
    link: '/clients/demo-meridian-financial/optimization', capabilityId: 'cap-transformation-planning' },
  { num: '10', id: 'validate', label: 'Validate',
    problem: 'Completing a transformation does not automatically prove the expected outcome was achieved.',
    action: 'Validates the transformed environment against defined expectations and criteria.',
    value: 'Provides evidence that transformation achieved its defined technical outcome.',
    inputs: ['Validation criteria', 'Expected state', 'Current state'],
    outputs: ['Validation result', 'Pass/Fail', 'Differences', 'Evidence'],
    automation: 'automatic', effort: 'low',
    clientProvides: ['Validation approval'],
    askabdDoes: ['Schema validation', 'Integrity checks', 'Comparison', 'Evidence capture'],
    askabdProduces: ['Validation result', 'Evidence', 'Pass/Fail status', 'Audit events'],
    capabilityId: 'cap-migration-validation' },
  { num: '11', id: 'measure', label: 'Measure',
    problem: 'After implementation, organizations lose visibility into whether expected benefits are achieved.',
    action: 'Tracks available operational, financial, risk and transformation indicators.',
    value: 'Shows whether the expected outcome is being realized.',
    inputs: ['KPI definitions', 'Baseline measurements', 'Target values'],
    outputs: ['Measurements', 'Benefit tracking', 'Variance', 'Progress indicators'],
    automation: 'askabd-assisted', effort: 'low',
    clientProvides: ['KPI definitions', 'Target values'],
    askabdDoes: ['Measurement collection', 'Variance calculation', 'Trend analysis'],
    askabdProduces: ['KPI dashboard', 'Benefit realization', 'Variance reports'],
    link: '/clients/demo-meridian-financial/optimization', capabilityId: 'cap-optimization-engine' },
  { num: '12', id: 'optimize', label: 'Optimize',
    problem: 'Technology environments and business requirements continuously change.',
    action: 'Uses ongoing observations, measurements and opportunities to identify further improvements.',
    value: 'Turns transformation into a continuous improvement cycle rather than a one-time project.',
    inputs: ['Measurements', 'New observations', 'Changed requirements'],
    outputs: ['Optimization opportunities', 'Recommendations', 'Improvement roadmap'],
    automation: 'askabd-assisted', effort: 'low',
    clientProvides: ['Changed requirements', 'New priorities'],
    askabdDoes: ['Opportunity detection', 'Recommendation generation', 'Priority scoring'],
    askabdProduces: ['Optimization findings', 'Recommendations', 'Updated roadmap'],
    link: '/clients/demo-meridian-financial/optimization', capabilityId: 'cap-optimization-engine' },
];

const AUTOMATION_BADGE: Record<string, string> = {
  'automatic': 'bg-green-100 text-green-700',
  'askabd-assisted': 'bg-blue-100 text-blue-700',
  'client-action': 'bg-orange-100 text-orange-700',
  'external-dependency': 'bg-gray-100 text-gray-600',
};
const AUTOMATION_LABEL: Record<string, string> = {
  'automatic': 'Automatic', 'askabd-assisted': 'AskABD Assisted', 'client-action': 'Client Action', 'external-dependency': 'External Dependency',
};

const CLIENT_VALUE = [
  { icon: '💰', title: 'Reduce unnecessary cost', desc: 'Identify potential cost reduction opportunities through evidence-based analysis' },
  { icon: '🛡️', title: 'Reduce operational risk', desc: 'Identify and prioritize technology, security and compliance risks' },
  { icon: '👁️', title: 'Improve technology visibility', desc: 'Create a complete current-state view of applications and infrastructure' },
  { icon: '🔍', title: 'Identify hidden problems', desc: 'Surface issues that are not visible without structured discovery and assessment' },
  { icon: '📊', title: 'Prioritize investments', desc: 'Use financial impact and risk data to support investment decisions' },
  { icon: '✅', title: 'Make evidence-based decisions', desc: 'Replace assumptions with traceable evidence and structured comparisons' },
  { icon: '⚙️', title: 'Execute with control', desc: 'Coordinate transformation activities with progress tracking and rollback' },
  { icon: '📋', title: 'Validate outcomes', desc: 'Prove that transformation achieved its defined objectives' },
  { icon: '📈', title: 'Track benefits', desc: 'Monitor whether expected savings and improvements are being realized' },
  { icon: '🔄', title: 'Continuously optimize', desc: 'Identify new improvement opportunities from ongoing observation' },
];

export default function WelcomePage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [registrySummary, setRegistrySummary] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/platform/services/registry/summary`).then(r => r.ok ? r.json() : null).then(setRegistrySummary).catch(() => {});
  }, []);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-14">

      {/* Hero */}
      <div className="text-center mb-14">
        <p className="text-xs font-semibold text-purple-600 tracking-[0.2em] mb-3">ASKABD ENTERPRISE PLATFORM</p>
        <h1 className="text-4xl font-extrabold leading-tight mb-4 gradient-text">
          From Business Problem to<br />Measurable Outcome
        </h1>
        <p className="text-base text-gray-600 max-w-2xl mx-auto mb-2 leading-relaxed">
          AskABD connects discovery, assessment, financial impact, decision-making, transformation, validation and continuous optimization in one operating platform.
        </p>
        <p className="text-xs text-gray-400 max-w-xl mx-auto mb-7">
          Every stage converts information into evidence, decisions, actions or measurable business outcomes.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link href="/platform" className="px-7 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-semibold transition">Explore Platform</Link>
          <Link href="/client-portal/demo-meridian-financial/journey" className="px-7 py-3 bg-white border text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-semibold transition">View Demo Journey</Link>
        </div>
      </div>

      {/* Journey */}
      <div className="mb-16">
        <h2 className="text-xl font-bold text-center mb-1.5 text-gray-900">The Transformation Journey</h2>
        <p className="text-center text-xs text-gray-400 mb-6">Click any stage to see what AskABD does, what you provide, and what value is created</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {STAGES.map(s => {
            const isExpanded = expanded === s.id;
            return (
              <div key={s.id} className={`bg-white rounded-xl border overflow-hidden transition ${isExpanded ? 'border-purple-300 ring-1 ring-purple-100' : ''}`}>
                <button onClick={() => setExpanded(isExpanded ? null : s.id)} className="w-full p-4 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold text-purple-600 mb-0.5">STEP {s.num}</p>
                      <p className="text-sm font-semibold text-gray-900 mb-1">{s.label}</p>
                      <p className="text-[11px] text-gray-500 leading-relaxed">{s.problem.slice(0, 80)}…</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap shrink-0 ${AUTOMATION_BADGE[s.automation]}`}>{AUTOMATION_LABEL[s.automation]}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t pt-3">
                    <p className="text-[11px] font-semibold text-orange-600 mb-1">Why this matters</p>
                    <p className="text-xs text-gray-700 mb-2.5">{s.problem}</p>

                    <p className="text-[11px] font-semibold text-blue-600 mb-1">How AskABD helps</p>
                    <p className="text-xs text-gray-700 mb-2.5">{s.action}</p>

                    <div className="grid grid-cols-2 gap-2 mb-2.5">
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 mb-1">YOU PROVIDE</p>
                        {s.clientProvides.map(c => <p key={c} className="text-[11px] text-gray-500 py-0.5">• {c}</p>)}
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 mb-1">ASKABD PRODUCES</p>
                        {s.askabdProduces.map(p => <p key={p} className="text-[11px] text-gray-500 py-0.5">• {p}</p>)}
                      </div>
                    </div>

                    <p className="text-[11px] font-semibold text-green-600 mb-1">Business value</p>
                    <p className="text-xs text-green-700 mb-2.5">{s.value}</p>

                    {s.link && (
                      <Link href={s.link} className="inline-block text-[11px] px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition">
                        Open {s.label} →
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Continuous Value Loop */}
      <div className="mb-16 text-center">
        <h2 className="text-lg font-bold mb-1.5 text-gray-900">AskABD Continuous Value Loop</h2>
        <p className="text-xs text-gray-400 mb-5">Every transformation creates new information. AskABD uses that information to identify the next improvement opportunity.</p>
        <div className="inline-flex flex-wrap gap-1.5 justify-center px-8 py-5 bg-white rounded-xl border">
          {['Discover', '→', 'Understand', '→', 'Quantify', '→', 'Decide', '→', 'Transform', '→', 'Validate', '→', 'Measure', '→', 'Optimize', '↺'].map((s, i) => (
            <span key={i} className={`px-1.5 py-1 ${s.length > 2 ? 'text-sm font-semibold text-purple-600' : 'text-sm text-gray-300'}`}>{s}</span>
          ))}
        </div>
      </div>

      {/* Client Value */}
      <div className="mb-16">
        <h2 className="text-lg font-bold text-center mb-1.5 text-gray-900">What AskABD Helps Your Organization Achieve</h2>
        <p className="text-center text-xs text-gray-400 mb-5">Outcomes AskABD can help enable through evidence-based transformation</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {CLIENT_VALUE.map(v => (
            <div key={v.title} className="bg-white rounded-xl border p-4">
              <p className="text-sm font-semibold text-gray-900 mb-1.5">{v.icon} {v.title}</p>
              <p className="text-[11px] text-gray-500 leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Platform Stats */}
      {registrySummary && (
        <div className="mb-12 text-center">
          <div className="inline-flex gap-6 px-8 py-4 bg-white rounded-xl border">
            <div><p className="text-xl font-bold text-blue-600">{registrySummary.total}</p><p className="text-[10px] text-gray-400">Capabilities</p></div>
            <div><p className="text-xl font-bold text-green-600">{registrySummary.operational}</p><p className="text-[10px] text-gray-400">Operational</p></div>
            <div><p className="text-xl font-bold text-orange-600">{registrySummary.planned || 0}</p><p className="text-[10px] text-gray-400">Planned</p></div>
          </div>
          <div className="mt-3">
            <Link href="/platform/services/registry" className="text-xs text-purple-600 hover:text-purple-800">View Full Service Registry →</Link>
          </div>
        </div>
      )}

      {/* ASK ONCE */}
      <div className="mb-12 text-center">
        <div className="inline-block px-10 py-6 bg-green-50 rounded-xl border border-green-200">
          <p className="text-base font-bold text-green-700 mb-1.5">ASK ONCE. REUSE EVERYWHERE.</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Information collected at any stage is automatically available throughout the journey. AskABD never asks for the same information twice.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center py-8">
        <Link href="/clients/onboard" className="inline-block px-8 py-3.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-semibold transition">Start New Client Journey</Link>
      </div>

      {/* Footer */}
      <div className="border-t pt-5 text-center">
        <p className="text-[11px] text-gray-400">AskABD Enterprise Platform • From Business Problem to Measurable Outcome</p>
      </div>
    </div>
  );
}
