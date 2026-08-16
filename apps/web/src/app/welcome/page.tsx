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

const AUTOMATION_LABELS: Record<string, { label: string; color: string }> = {
  'automatic': { label: 'Automatic', color: '#22c55e' },
  'askabd-assisted': { label: 'AskABD Assisted', color: '#3b82f6' },
  'client-action': { label: 'Client Action', color: '#f59e0b' },
  'external-dependency': { label: 'External Dependency', color: '#6b7280' },
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
    <div style={{ background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 24px 40px' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#38bdf8', letterSpacing: 2, marginBottom: 12 }}>ASKABD ENTERPRISE PLATFORM</div>
          <h1 style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.2, margin: '0 0 16px', background: 'linear-gradient(135deg, #f1f5f9, #38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            From Business Problem to<br/>Measurable Outcome
          </h1>
          <p style={{ fontSize: 16, color: '#94a3b8', maxWidth: 750, margin: '0 auto 8px', lineHeight: 1.6 }}>
            AskABD connects discovery, assessment, financial impact, decision-making, transformation, validation and continuous optimization in one operating platform.
          </p>
          <p style={{ fontSize: 13, color: '#64748b', maxWidth: 650, margin: '0 auto 28px' }}>
            Every stage converts information into evidence, decisions, actions or measurable business outcomes.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/platform" style={{ padding: '12px 28px', background: '#1e40af', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Explore Platform</Link>
            <Link href="/client-portal/demo-meridian-financial/journey" style={{ padding: '12px 28px', background: '#334155', color: '#f1f5f9', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none', border: '1px solid #475569' }}>View Demo Journey</Link>
          </div>
        </div>

        {/* Journey */}
        <div style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', marginBottom: 8, color: '#e2e8f0' }}>The Transformation Journey</h2>
          <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b', marginBottom: 28 }}>Click any stage to see what AskABD does, what you provide, and what value is created</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {STAGES.map(s => {
              const isExpanded = expanded === s.id;
              const auto = AUTOMATION_LABELS[s.automation];
              return (
                <div key={s.id} style={{ background: '#1e293b', borderRadius: 10, border: isExpanded ? '1px solid #3b82f6' : '1px solid #334155', overflow: 'hidden', transition: 'border-color 0.2s' }}>
                  <button onClick={() => setExpanded(isExpanded ? null : s.id)} style={{ width: '100%', padding: '14px 16px', background: 'none', border: 'none', color: '#f1f5f9', textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#38bdf8', marginBottom: 3 }}>STEP {s.num}</div>
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>{s.problem.slice(0, 80)}...</div>
                      </div>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: `${auto.color}22`, color: auto.color, whiteSpace: 'nowrap', marginLeft: 8 }}>{auto.label}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div style={{ padding: '0 16px 16px', borderTop: '1px solid #334155' }}>
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>Why this matters</div>
                        <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 10 }}>{s.problem}</div>

                        <div style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', marginBottom: 4 }}>How AskABD helps</div>
                        <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 10 }}>{s.action}</div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>YOU PROVIDE</div>
                            {s.clientProvides.map(c => <div key={c} style={{ fontSize: 11, color: '#94a3b8', padding: '1px 0' }}>• {c}</div>)}
                          </div>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>ASKABD PRODUCES</div>
                            {s.askabdProduces.map(p => <div key={p} style={{ fontSize: 11, color: '#94a3b8', padding: '1px 0' }}>• {p}</div>)}
                          </div>
                        </div>

                        <div style={{ fontSize: 11, fontWeight: 600, color: '#22c55e', marginBottom: 4 }}>Business value</div>
                        <div style={{ fontSize: 12, color: '#a7f3d0', marginBottom: 10 }}>{s.value}</div>

                        {s.link && (
                          <Link href={s.link} style={{ display: 'inline-block', fontSize: 11, padding: '5px 12px', background: '#334155', color: '#38bdf8', borderRadius: 6, textDecoration: 'none', border: '1px solid #475569' }}>
                            Open {s.label} →
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Continuous Value Loop */}
        <div style={{ marginBottom: 64, textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>AskABD Continuous Value Loop</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Every transformation creates new information. AskABD uses that information to identify the next improvement opportunity.</p>
          <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', padding: '20px 32px', background: '#1e293b', borderRadius: 12, border: '1px solid #334155' }}>
            {['Discover', '→', 'Understand', '→', 'Quantify', '→', 'Decide', '→', 'Transform', '→', 'Validate', '→', 'Measure', '→', 'Optimize', '↺'].map((s, i) => (
              <span key={i} style={{ fontSize: s.length <= 2 ? 14 : 13, fontWeight: s.length > 2 ? 600 : 400, color: s.length > 2 ? '#38bdf8' : '#64748b', padding: '4px 6px' }}>{s}</span>
            ))}
          </div>
        </div>

        {/* Client Value */}
        <div style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 8, color: '#e2e8f0' }}>What AskABD Helps Your Organization Achieve</h2>
          <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b', marginBottom: 20 }}>Outcomes AskABD can help enable through evidence-based transformation</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {CLIENT_VALUE.map(v => (
              <div key={v.title} style={{ padding: '14px 16px', background: '#1e293b', borderRadius: 8, border: '1px solid #334155' }}>
                <div style={{ fontSize: 14, marginBottom: 6 }}>{v.icon} <span style={{ fontWeight: 600, fontSize: 13 }}>{v.title}</span></div>
                <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>{v.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Platform Stats */}
        {registrySummary && (
          <div style={{ marginBottom: 48, textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', gap: 24, padding: '16px 32px', background: '#1e293b', borderRadius: 10, border: '1px solid #334155' }}>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>{registrySummary.total}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>Capabilities</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{registrySummary.operational}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>Operational</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{registrySummary.planned || 0}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>Planned</div></div>
            </div>
            <div style={{ marginTop: 12 }}>
              <Link href="/platform/services/registry" style={{ fontSize: 12, color: '#38bdf8', textDecoration: 'none' }}>View Full Service Registry →</Link>
            </div>
          </div>
        )}

        {/* ASK ONCE */}
        <div style={{ marginBottom: 48, textAlign: 'center' }}>
          <div style={{ display: 'inline-block', padding: '24px 40px', background: 'linear-gradient(135deg, #065f46, #0f172a)', borderRadius: 12, border: '1px solid #10b981' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#6ee7b7', marginBottom: 6 }}>ASK ONCE. REUSE EVERYWHERE.</div>
            <p style={{ fontSize: 13, color: '#94a3b8', maxWidth: 500, margin: 0 }}>
              Information collected at any stage is automatically available throughout the journey. AskABD never asks for the same information twice.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <Link href="/clients/onboard" style={{ display: 'inline-block', padding: '14px 32px', background: '#1e40af', color: '#fff', borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>Start New Client Journey</Link>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #334155', paddingTop: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#64748b' }}>AskABD Enterprise Platform • From Business Problem to Measurable Outcome</p>
        </div>
      </div>
    </div>
  );
}
