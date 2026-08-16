'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Breadcrumb } from '../../../components/breadcrumb';
import {
  getLifecycleState, persistLifecycleState, requestLifecycleTransition, fetchServerLifecycle,
  statusMeta, getProgress, getCurrentStepInfo, getNextStep,
  type LifecycleState, type LifecycleStatus, type WorkflowEvent
} from '../../../lib/onboarding-lifecycle';
import { logAuditEvent } from '../../../lib/operations-api';
import { calculateClientDeliveryStatus, getServiceForStatus, type ServiceRequirement } from '../../../lib/service-readiness';
import { OperationStatusPanel } from '../../../components/operation-status-panel';
import { RequirementWorkspace } from '../../../components/requirement-workspace';

interface PhaseConfig {
  status: LifecycleStatus;
  title: string;
  owner: 'client' | 'askabd' | 'automatic' | 'approval';
  checks: { id: string; label: string; description: string; purpose?: string; howTo?: string }[];
  nextEvent: WorkflowEvent;
  actionLabel: string;
}

const phases: PhaseConfig[] = [
  { status: 'otp-verified', title: 'Identity Verification', owner: 'automatic', nextEvent: 'identity_verified', actionLabel: 'Confirm Identity',
    checks: [
      { id: 'email-verified', label: 'Email Ownership Verified', description: 'OTP was successfully validated' },
      { id: 'org-exists', label: 'Organization Record Exists', description: 'Client record persisted in database' },
      { id: 'contact-valid', label: 'Business Contact Valid', description: 'Primary contact information verified' },
    ]},
  { status: 'identity-verified', title: 'Security Validation', owner: 'askabd', nextEvent: 'security_validated', actionLabel: 'Complete Security Validation',
    checks: [
      { id: 'auth-config', label: 'Authentication Configured', description: 'SSO/OAuth/API key authentication method defined',
        purpose: 'Defines how users and services prove their identity when accessing your environment. Prevents unauthorized access.',
        howTo: 'Choose one: SSO (SAML/OIDC) for enterprise login, OAuth2 for API integrations, or API key for service-to-service. Provide your IdP metadata URL or generate API credentials from your auth provider.' },
      { id: 'access-policy', label: 'Access Policy Defined', description: 'Role-based access control configured',
        purpose: 'Ensures AskABD only accesses what is explicitly permitted. Limits blast radius if credentials are compromised.',
        howTo: 'Define roles (admin, read-only, operator) and map them to teams/services. Specify which resources each role can access. AskABD requires read-only access for discovery.' },
      { id: 'security-scan', label: 'Security Scan Passed', description: 'No critical vulnerabilities detected',
        purpose: 'Identifies existing security issues before AskABD connects. Protects both parties from known vulnerabilities.',
        howTo: 'AskABD runs an automated scan against your provided endpoints. No action needed from you — results are shared for review. Critical findings must be acknowledged before proceeding.' },
      { id: 'compliance', label: 'Compliance Requirements Met', description: 'Industry compliance standards validated',
        purpose: 'Ensures the engagement meets your regulatory obligations (SOC2, ISO27001, HIPAA, GDPR, PCI-DSS as applicable).',
        howTo: 'Specify which compliance frameworks apply to your organization. AskABD will validate that its access patterns and data handling meet those standards.' },
      { id: 'encryption', label: 'Encryption Validated', description: 'Data at rest and in transit encryption confirmed',
        purpose: 'Verifies that all data exchanged between your systems and AskABD is encrypted, preventing interception or tampering.',
        howTo: 'Confirm TLS 1.2+ on all endpoints. AskABD verifies certificates and cipher suites automatically. For data at rest, confirm your storage uses AES-256 or equivalent.' },
    ]},
  { status: 'security-validated', title: 'Environment Registration', owner: 'client', nextEvent: 'environment_registered', actionLabel: 'Register Environments',
    checks: [
      { id: 'env-list', label: 'Environments Listed', description: 'All active environments documented' },
      { id: 'env-access', label: 'Environment Access Confirmed', description: 'Read access to each environment verified' },
      { id: 'env-config', label: 'Configuration Captured', description: 'Network, ports, credentials documented' },
    ]},
  { status: 'environment-registered', title: 'Connector Configuration', owner: 'client', nextEvent: 'connectors_configured', actionLabel: 'Validate Connectors',
    checks: [
      { id: 'conn-selected', label: 'Connectors Selected', description: 'Required integration connectors chosen' },
      { id: 'conn-auth', label: 'Credentials Provided', description: 'Authentication configured for each connector' },
      { id: 'conn-test', label: 'Connection Test Passed', description: 'Each connector validated with health check' },
    ]},
  { status: 'connectors-configured', title: 'Discovery', owner: 'askabd', nextEvent: 'discovery_started', actionLabel: 'Start Discovery',
    checks: [
      { id: 'disc-scope', label: 'Discovery Scope Defined', description: 'Systems and boundaries identified' },
      { id: 'disc-readonly', label: 'Read-Only Access Confirmed', description: 'No source data will be modified' },
      { id: 'disc-consent', label: 'Customer Consent Received', description: 'Written approval for environment scanning' },
    ]},
  { status: 'discovery-running', title: 'Discovery In Progress', owner: 'automatic', nextEvent: 'discovery_completed', actionLabel: 'Complete Discovery',
    checks: [
      { id: 'disc-apps', label: 'Applications Discovered', description: 'All applications inventoried' },
      { id: 'disc-data', label: 'Data Sources Mapped', description: 'Databases, schemas, tables catalogued' },
      { id: 'disc-infra', label: 'Infrastructure Mapped', description: 'Servers, networks, cloud resources documented' },
      { id: 'disc-deps', label: 'Dependencies Identified', description: 'Inter-service dependencies mapped' },
    ]},
  { status: 'discovery-complete', title: 'Assessment', owner: 'askabd', nextEvent: 'assessment_started', actionLabel: 'Start Assessment',
    checks: [
      { id: 'assess-scope', label: 'Assessment Scope Confirmed', description: 'Discovery results reviewed and validated' },
      { id: 'assess-criteria', label: 'Assessment Criteria Defined', description: 'Security, performance, reliability, compatibility' },
    ]},
  { status: 'assessment-running', title: 'Assessment In Progress', owner: 'automatic', nextEvent: 'assessment_completed', actionLabel: 'Complete Assessment',
    checks: [
      { id: 'assess-security', label: 'Security Assessment', description: 'Vulnerabilities and risks identified' },
      { id: 'assess-perf', label: 'Performance Assessment', description: 'Bottlenecks and capacity issues found' },
      { id: 'assess-compat', label: 'Compatibility Assessment', description: 'Migration readiness evaluated' },
      { id: 'assess-risk', label: 'Risk Assessment', description: 'Business impact analysis complete' },
    ]},
  { status: 'assessment-complete', title: 'Recommendations', owner: 'askabd', nextEvent: 'recommendations_generated', actionLabel: 'Generate Recommendations',
    checks: [
      { id: 'rec-findings', label: 'Findings Reviewed', description: 'All assessment findings analyzed' },
      { id: 'rec-solutions', label: 'Solutions Proposed', description: 'Remediation and migration options defined' },
      { id: 'rec-impact', label: 'Impact Estimated', description: 'Cost, effort, timeline estimated' },
    ]},
  { status: 'recommendations-generated', title: 'Customer Approval', owner: 'approval', nextEvent: 'migration_plan_created', actionLabel: 'Create Migration Plan',
    checks: [
      { id: 'appr-reviewed', label: 'Recommendations Reviewed', description: 'Customer reviewed all recommendations' },
      { id: 'appr-accepted', label: 'Approach Accepted', description: 'Customer agreed to migration strategy' },
      { id: 'appr-budget', label: 'Budget Approved', description: 'Required budget confirmed' },
    ]},
  { status: 'migration-planning', title: 'Migration Approval', owner: 'approval', nextEvent: 'migration_approved', actionLabel: 'Approve Migration',
    checks: [
      { id: 'plan-source', label: 'Source Validated', description: 'Source systems confirmed accessible' },
      { id: 'plan-target', label: 'Target Prepared', description: 'Target environment provisioned' },
      { id: 'plan-waves', label: 'Migration Waves Defined', description: 'Execution sequence planned' },
      { id: 'plan-rollback', label: 'Rollback Plan Ready', description: 'Recovery procedures documented' },
    ]},
  { status: 'migration-approved', title: 'Migration Execution', owner: 'askabd', nextEvent: 'migration_started', actionLabel: 'Start Migration',
    checks: [
      { id: 'mig-preflight', label: 'Pre-Flight Passed', description: 'All prerequisites validated' },
      { id: 'mig-dryrun', label: 'Dry Run Successful', description: 'Simulation completed without errors' },
      { id: 'mig-approval', label: 'Final Approval Received', description: 'Go/No-Go decision confirmed' },
    ]},
  { status: 'migration-running', title: 'Migration In Progress', owner: 'automatic', nextEvent: 'migration_completed', actionLabel: 'Complete Migration',
    checks: [
      { id: 'mig-transfer', label: 'Data Transfer Complete', description: 'All objects transferred to target' },
      { id: 'mig-integrity', label: 'Integrity Checks Passed', description: 'Checksums and row counts verified' },
      { id: 'mig-errors', label: 'Zero Critical Errors', description: 'No unresolved critical failures' },
    ]},
  { status: 'migration-complete', title: 'Post-Migration Validation', owner: 'askabd', nextEvent: 'validation_started', actionLabel: 'Start Validation',
    checks: [
      { id: 'val-scope', label: 'Validation Scope Defined', description: 'All migrated objects targeted for verification' },
    ]},
  { status: 'validation-running', title: 'Validation In Progress', owner: 'automatic', nextEvent: 'validation_passed', actionLabel: 'Mark Validation Passed',
    checks: [
      { id: 'val-data', label: 'Data Integrity Verified', description: 'Source vs target comparison passed' },
      { id: 'val-schema', label: 'Schema Validation', description: 'All structures match specification' },
      { id: 'val-app', label: 'Application Connectivity', description: 'Applications connect to new data sources' },
      { id: 'val-perf', label: 'Performance Baseline Met', description: 'Response times within acceptable range' },
    ]},
  { status: 'validation-passed', title: 'Governance Audit', owner: 'askabd', nextEvent: 'audit_started', actionLabel: 'Start Audit',
    checks: [
      { id: 'audit-scope', label: 'Audit Scope Confirmed', description: 'Compliance requirements identified' },
    ]},
  { status: 'audit-running', title: 'Audit In Progress', owner: 'automatic', nextEvent: 'audit_passed', actionLabel: 'Mark Audit Passed',
    checks: [
      { id: 'audit-compliance', label: 'Compliance Verified', description: 'All regulatory requirements met' },
      { id: 'audit-evidence', label: 'Evidence Collected', description: 'Complete audit trail available' },
      { id: 'audit-sign', label: 'Audit Report Signed', description: 'Independent review completed' },
    ]},
  { status: 'audit-passed', title: 'Go Live', owner: 'approval', nextEvent: 'go_live', actionLabel: 'Approve Go-Live',
    checks: [
      { id: 'go-readiness', label: 'Production Readiness Confirmed', description: 'All systems verified for production' },
      { id: 'go-support', label: 'Support Ready', description: 'Hyper-care team on standby' },
      { id: 'go-rollback', label: 'Rollback Tested', description: 'Recovery plan validated' },
    ]},
  { status: 'go-live', title: 'Hyper Care', owner: 'askabd', nextEvent: 'hyper_care_started', actionLabel: 'Enter Hyper Care',
    checks: [
      { id: 'hc-traffic', label: 'Production Traffic Confirmed', description: 'Live traffic flowing through new systems' },
      { id: 'hc-monitor', label: 'Enhanced Monitoring Active', description: '24/7 monitoring with reduced thresholds' },
    ]},
  { status: 'hyper-care', title: 'Managed Services', owner: 'askabd', nextEvent: 'managed_services_active', actionLabel: 'Activate Managed Services',
    checks: [
      { id: 'ms-stable', label: 'System Stable (2+ weeks)', description: 'No critical incidents during hyper-care' },
      { id: 'ms-sla', label: 'SLA Targets Met', description: 'All service levels within bounds' },
      { id: 'ms-handover', label: 'Operations Handover Complete', description: 'BAU team trained and ready' },
    ]},
  { status: 'managed-services', title: 'Continuous Monitoring', owner: 'automatic', nextEvent: 'monitoring_active', actionLabel: 'Activate Monitoring',
    checks: [
      { id: 'mon-infra', label: 'Infrastructure Monitoring', description: 'All infrastructure monitored' },
      { id: 'mon-app', label: 'Application Monitoring', description: 'APM and logging active' },
      { id: 'mon-alerts', label: 'Alert Rules Configured', description: 'Escalation paths defined' },
    ]},
  { status: 'continuous-monitoring', title: 'Engineering Intelligence', owner: 'automatic', nextEvent: 'engineering_active', actionLabel: 'Enable Engineering Intelligence',
    checks: [
      { id: 'ei-data', label: 'Telemetry Data Flowing', description: 'Sufficient data for AI analysis' },
      { id: 'ei-models', label: 'AI Models Active', description: 'RCA and prediction engines running' },
    ]},
];

export default function LifecycleJourneyPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.clientId as string;
  const [state, setState] = useState<LifecycleState | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [client, setClient] = useState<any>(null);
  const [readinessData, setReadinessData] = useState<any>(null);
  const [requirements, setRequirements] = useState<any[]>([]);

  useEffect(() => {
    // Load from localStorage cache first (immediate render)
    const ls = getLifecycleState(clientId);
    setState(ls);
    try {
      const clients = JSON.parse(localStorage.getItem('askabd-onboarded-clients') || '[]');
      const match = Array.isArray(clients) ? clients.find((c: any) => c.id === clientId) : null;
      if (match) setClient(match);
    } catch { /* skip */ }
    // Then fetch authoritative state from server
    fetchServerLifecycle(clientId).then(async serverState => {
      if (serverState) {
        setState(serverState);
      } else if (ls) {
        // Server has no lifecycle but localStorage does — sync it
        const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
        try {
          await fetch(`${API}/api/v1/oc/lifecycle/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, initialStatus: ls.status }),
          });
          // Re-fetch from server to confirm
          const confirmed = await fetchServerLifecycle(clientId);
          if (confirmed) setState(confirmed);
        } catch { /* best-effort sync */ }
      }
    });
  }, [clientId]);

  // Reload readiness when lifecycle state changes
  useEffect(() => {
    if (state) loadReadiness();
  }, [state?.status]);

  // Auto-populate identity requirements from onboarding data if all are empty
  useEffect(() => {
    if (!state || state.status !== 'otp-verified') return;
    if (!requirements || requirements.length === 0) return;
    // Check if all identity requirements are not_provided
    const allEmpty = requirements.every((r: any) => r.status === 'not_provided');
    if (!allEmpty) return;
    // Get client data from localStorage
    let clientData: any = null;
    try {
      const clients = JSON.parse(localStorage.getItem('askabd-onboarded-clients') || '[]');
      clientData = Array.isArray(clients) ? clients.find((c: any) => c.id === clientId) : null;
    } catch { /* skip */ }
    if (!clientData) return;
    // Auto-save from onboarding data
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
    const serviceId = 'identity-verification';
    const saves: Promise<any>[] = [];
    if (clientData.businessOwner) {
      saves.push(fetch(`${API}/api/v1/oc/client-services/${clientId}/${serviceId}/requirements/business_owner_email`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: clientData.businessOwner, actor: 'system' }),
      }).catch(() => {}));
      // Derive name from email
      const prefix = clientData.businessOwner.split('@')[0] || '';
      const name = prefix.replace(/[\d_\-\.]+/g, ' ').trim();
      const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
      if (capitalized) {
        saves.push(fetch(`${API}/api/v1/oc/client-services/${clientId}/${serviceId}/requirements/business_owner_name`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: capitalized, actor: 'system' }),
        }).catch(() => {}));
      }
    }
    if (clientData.name) {
      saves.push(fetch(`${API}/api/v1/oc/client-services/${clientId}/${serviceId}/requirements/organization_legal_name`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: clientData.name, actor: 'system' }),
      }).catch(() => {}));
    }
    if (saves.length > 0) {
      Promise.all(saves).then(() => loadReadiness());
    }
  }, [state?.status, requirements]);

  // Auto-advance lifecycle when readiness is satisfied and we're at otp-verified
  useEffect(() => {
    if (!state || state.status !== 'otp-verified') return;
    if (!readinessData || readinessData.status !== 'ready') return;
    // All requirements are satisfied — auto-transition
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
    fetch(`${API}/api/v1/oc/lifecycle/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, event: 'identity_verified', actor: 'system', actorType: 'system', details: 'Auto-verified from onboarding data' }),
    }).then(res => res.json()).then(data => {
      if (data.success && data.lifecycle) {
        const newState: LifecycleState = {
          organizationId: state.organizationId,
          organizationName: state.organizationName,
          status: data.lifecycle.status as LifecycleStatus,
          previousStatus: data.lifecycle.previousStatus,
          events: data.lifecycle.events || state.events,
          updatedAt: data.lifecycle.updatedAt || new Date().toISOString(),
          createdAt: state.createdAt,
        };
        setState(newState);
        persistLifecycleState(newState);
      }
    }).catch(() => {});
  }, [state?.status, readinessData?.status]);

  async function loadReadiness() {
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
    // Use the authoritative state (component state, which comes from server)
    const status = state?.status;
    if (!status) return;
    // Map phase to service ID (use the service-readiness mapping)
    const serviceMap: Record<string, string> = { 'otp-verified': 'identity-verification', 'identity-verified': 'security-validation', 'security-validated': 'environment-registration', 'environment-registered': 'connector-configuration', 'connectors-configured': 'discovery' };
    const serviceId = serviceMap[status || ''];
    if (!serviceId) { setReadinessData(null); setRequirements([]); return; }
    try {
      const res = await fetch(`${API}/api/v1/oc/client-services/${clientId}/${serviceId}/readiness`, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = await res.json();
        setReadinessData(data.readiness);
      }
      // Also load requirements
      const reqRes = await fetch(`${API}/api/v1/oc/client-services/${clientId}/${serviceId}/requirements`, { signal: AbortSignal.timeout(15000) });
      if (reqRes.ok) {
        const reqData = await reqRes.json();
        setRequirements(reqData.requirements || []);
      }
    } catch { /* API unavailable */ }
  }

  if (!state) {
    return (
      <div className="space-y-4">
        <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Clients', href: '/clients' }, { label: 'Lifecycle' }]} />
        <div className="bg-white rounded-xl border p-8 text-center">
          <p className="text-sm text-gray-500">No lifecycle state found for this client.</p>
          <button onClick={() => router.push('/clients/onboard')} className="mt-4 text-sm text-purple-600 font-medium">Start Onboarding →</button>
        </div>
      </div>
    );
  }

  const currentPhase = phases.find(p => p.status === state.status);
  const progress = getProgress(state.status);
  const currentStep = getCurrentStepInfo(state.status);
  const nextStep = getNextStep(state.status);
  const allStatuses = Object.keys(statusMeta) as LifecycleStatus[];
  const currentOrder = statusMeta[state.status]?.order ?? 0;

  // Service Readiness — what this client actually needs right now
  const delivery = calculateClientDeliveryStatus(clientId, client?.name || state.organizationName, state.status);
  const currentServiceReq = getServiceForStatus(state.status);

  function toggleCheck(id: string) {
    const next = new Set(checkedItems);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCheckedItems(next);
  }

  function allChecksComplete(): boolean {
    // Use real backend readiness if available
    if (readinessData) return readinessData.status === 'ready';
    // Fallback to manual checks for stages without service definitions
    if (!currentPhase) return false;
    return currentPhase.checks.every(c => checkedItems.has(c.id));
  }

  async function advancePhase() {
    if (!currentPhase || !allChecksComplete() || processing) return;
    setProcessing(true);

    // Use server-side lifecycle transition (PostgreSQL is authoritative)
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
    try {
      const res = await fetch(`${API}/api/v1/oc/lifecycle/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, event: currentPhase.nextEvent, actor: 'admin', actorType: 'user' }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.lifecycle) {
          // Update local state from server response
          const newState: LifecycleState = {
            organizationId: state!.organizationId,
            organizationName: state!.organizationName,
            status: data.lifecycle.status as LifecycleStatus,
            previousStatus: data.lifecycle.previousStatus,
            events: data.lifecycle.events || state!.events,
            updatedAt: data.lifecycle.updatedAt || new Date().toISOString(),
            createdAt: state!.createdAt,
          };
          setState(newState);
          // Also update localStorage cache
          persistLifecycleState(newState);
          setCheckedItems(new Set());
          logAuditEvent({
            entityType: 'lifecycle', entityId: clientId, entityName: state!.organizationName,
            action: currentPhase.nextEvent, actor: 'admin',
            details: { fromStatus: state!.status, toStatus: data.lifecycle.status },
            evidence: [`Phase "${currentPhase.title}" completed`],
          }).catch(() => {});
        }
      } else {
        // Transition blocked — show the real reason
        const errData = await res.json().catch(() => null);
        if (errData?.readiness?.blockers?.length > 0) {
          const blockerMsg = errData.readiness.blockers.map((b: any) => b.message).join(', ');
          alert(`Cannot advance: ${blockerMsg}\n\nPlease complete all requirements in the workspace below before confirming.`);
        } else {
          alert(`Transition failed: ${errData?.error || 'Unknown error'}. Please try again.`);
        }
      }
    } catch (err) {
      // Retry once silently before alerting
      try {
        await new Promise(r => setTimeout(r, 2000));
        const retryRes = await fetch(`${API}/api/v1/oc/lifecycle/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: state!.organizationId || params.clientId, event: currentPhase.nextEvent, actor: 'admin', actorType: 'user' }),
        });
        if (retryRes.ok) {
          const data = await retryRes.json();
          if (data.success && data.lifecycle) {
            const newState = { ...state!, status: data.lifecycle.status, previousStatus: data.lifecycle.previousStatus, updatedAt: data.lifecycle.updatedAt };
            setState(newState);
            persistLifecycleState(newState);
          }
          setProcessing(false);
          return;
        }
      } catch { /* retry also failed */ }
      alert('Service temporarily unavailable. Please wait a moment and try again.');
    }
    setProcessing(false);
  }

  const ownerLabels: Record<string, { label: string; color: string }> = {
    client: { label: 'CLIENT ACTION REQUIRED', color: 'bg-amber-100 text-amber-700' },
    askabd: { label: 'ASKABD ACTION', color: 'bg-purple-100 text-purple-700' },
    automatic: { label: 'AUTOMATIC', color: 'bg-blue-100 text-blue-700' },
    approval: { label: 'APPROVAL REQUIRED', color: 'bg-red-100 text-red-700' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Client Lifecycle Journey</h2>
            <p className="text-xs text-gray-500 mt-0.5">{client?.name || state.organizationName} — Enterprise Customer Success Lifecycle</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-purple-600">{progress}%</p>
            <p className="text-[9px] text-gray-400 uppercase">Complete</p>
          </div>
        </div>
        {/* Progress bar — major lifecycle milestones only */}
        {(() => {
          const milestones = allStatuses.filter(s => {
            const o = statusMeta[s]?.order ?? 0;
            if (o < 3) return false;
            // Show only key milestones, skip intermediate running/complete pairs
            const label = statusMeta[s]?.label || '';
            if (label.includes('Running') || label.includes('In Progress')) return false;
            return true;
          });
          return (
            <div className="flex gap-1 mb-3 flex-wrap">
              {milestones.map((s, i) => {
                const order = statusMeta[s]?.order ?? 0;
                const isComplete = order <= currentOrder;
                const isNext = !isComplete && milestones.filter(ms => (statusMeta[ms]?.order ?? 0) <= currentOrder).length === i;
                return (
                  <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${isComplete ? 'bg-green-500 text-white' : isNext ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-400'}`}
                    title={statusMeta[s]?.label || s}>
                    {isComplete ? '✓' : i + 1}
                  </div>
                );
              })}
            </div>
          );
        })()}
        <div className="flex items-center justify-between text-[10px] flex-wrap gap-2">
          {(() => {
            const milestones = allStatuses.filter(s => {
              const o = statusMeta[s]?.order ?? 0;
              if (o < 3) return false;
              const label = statusMeta[s]?.label || '';
              if (label.includes('Running') || label.includes('In Progress')) return false;
              return true;
            });
            const completedCount = milestones.filter(s => (statusMeta[s]?.order ?? 0) <= currentOrder).length;
            return <span className="text-gray-500">Completed: <span className="font-semibold text-green-700">Step {completedCount} of {milestones.length}</span></span>;
          })()}
          {currentPhase && <span className="text-gray-500">Now working on: <span className="font-semibold text-purple-700">{currentPhase.title}</span></span>}
          {nextStep && <span className="text-gray-400">Next: {nextStep.label}</span>}
          {currentPhase && <span className={`font-semibold px-2 py-0.5 rounded ${ownerLabels[currentPhase.owner].color}`}>{ownerLabels[currentPhase.owner].label}</span>}
        </div>
        {/* Problem Universe link — visible after assessment-complete (order >= 13) */}
        {currentOrder >= 13 && (
          <div className="mt-3 pt-3 border-t">
            <Link href={`/clients/${clientId}/problems`} className="inline-flex items-center gap-2 text-[10px] font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-200 transition">
              🔍 View Problem Universe — {currentOrder >= 13 ? 'Enterprise problems, impact & recommendations' : ''}
            </Link>
          </div>
        )}
      </div>

      {/* Client Delivery Status — Service Readiness Engine */}
      {currentServiceReq && (
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Current Service Delivery</h3>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${ownerLabels[delivery.currentOwner].color}`}>{ownerLabels[delivery.currentOwner].label}</span>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-gray-500 mb-1">Current Service</p>
              <p className="text-sm font-semibold text-purple-700">{currentServiceReq.serviceName}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">{currentServiceReq.description}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 mb-1">Expected Output</p>
              <div className="flex flex-wrap gap-1">{currentServiceReq.expectedOutput.map((o, i) => <span key={i} className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">{o}</span>)}</div>
            </div>
          </div>
          {/* Client & AskABD Actions */}
          <div className="grid md:grid-cols-2 gap-4 mt-4 pt-3 border-t">
            {delivery.clientActions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-amber-700 mb-1.5">⚡ Client Must Provide</p>
                <ul className="space-y-1">{delivery.clientActions.map((a, i) => <li key={i} className="text-[10px] text-gray-700 flex items-start gap-1.5"><span className="text-amber-500 mt-0.5">•</span>{a}</li>)}</ul>
              </div>
            )}
            {delivery.askabdActions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-purple-700 mb-1.5">🔧 AskABD Will Perform</p>
                <ul className="space-y-1">{delivery.askabdActions.map((a, i) => <li key={i} className="text-[10px] text-gray-700 flex items-start gap-1.5"><span className="text-purple-500 mt-0.5">•</span>{a}</li>)}</ul>
              </div>
            )}
          </div>
          {/* Required Connectors */}
          {currentServiceReq.requiredConnectors.length > 0 && (
            <div className="mt-4 pt-3 border-t">
              <p className="text-[10px] font-semibold text-gray-700 mb-2">🔌 Required Connections</p>
              <div className="space-y-2">
                {currentServiceReq.requiredConnectors.map((conn, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-800">{conn.provider}</p>
                      <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-100 text-green-700">{conn.securityLevel}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">{conn.whyNeeded}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {conn.requiredFields.map((f, j) => <span key={j} className="text-[9px] bg-white border px-1.5 py-0.5 rounded text-gray-600">{f.label}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Security Note */}
          <div className="mt-3 pt-2 border-t">
            <p className="text-[9px] text-gray-400">🔒 Security: {currentServiceReq.securityNote}</p>
            <p className="text-[9px] text-gray-400">⏱ Estimated: {currentServiceReq.estimatedDuration}</p>
          </div>
        </div>
      )}

      {/* Current Phase Detail */}
      {currentPhase ? (
        <div className="bg-white rounded-xl border p-5">
          {/* Completed status banner — shows the status that was achieved to reach this phase */}
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 mb-4 flex items-center gap-2">
            <span className="text-green-600 text-sm">✓</span>
            <p className="text-xs text-green-700 font-medium">{currentStep.label} — Completed</p>
            <span className="text-[9px] text-green-500 ml-auto">Now complete the next service to advance</span>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-purple-600 font-bold text-sm">{(() => {
                const milestones = allStatuses.filter(s => { const o = statusMeta[s]?.order ?? 0; if (o < 3) return false; const label = statusMeta[s]?.label || ''; if (label.includes('Running') || label.includes('In Progress')) return false; return true; });
                return milestones.filter(s => (statusMeta[s]?.order ?? 0) <= currentOrder).length + 1;
              })()}</span>
            </div>
            <div>
              <p className="text-[9px] text-gray-500 uppercase font-medium tracking-wide">Active Service — Complete to advance</p>
              <h3 className="text-sm font-bold text-gray-900">{currentPhase.title}</h3>
              <p className="text-[10px] text-gray-500">Transition: <span className="font-medium">{currentStep.label}</span> → <span className="font-medium">{nextStep?.label || 'Next'}</span></p>
            </div>
          </div>

          {/* Guidance — Why is this service needed */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
            <p className="text-[10px] font-bold text-purple-800 mb-2">📋 Why is this step required?</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
              <div><span className="text-purple-500 font-medium">Purpose:</span> <span className="text-purple-700">{currentServiceReq?.description || currentStep.description}</span></div>
              <div><span className="text-purple-500 font-medium">Why Required:</span> <span className="text-purple-700">{currentStep.why}</span></div>
              <div><span className="text-purple-500 font-medium">Success Criteria:</span> <span className="text-purple-700">{currentServiceReq?.successCriteria || currentStep.successCriteria}</span></div>
              <div><span className="text-purple-500 font-medium">What Happens Next:</span> <span className="text-purple-700">{currentStep.whatNext}</span></div>
              {currentServiceReq?.blockingConditions && currentServiceReq.blockingConditions.length > 0 && (
                <div className="col-span-full"><span className="text-purple-500 font-medium">Blocking If:</span> <span className="text-purple-700">{currentServiceReq.blockingConditions.join(', ')}</span></div>
              )}
            </div>
            {/* Value to Client and AskABD */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-purple-200 text-[10px]">
              <div>
                <p className="font-semibold text-amber-700 mb-1">💼 Value to Client</p>
                <p className="text-purple-700">{
                  currentPhase.owner === 'client' ? 'Ensures your systems, credentials, and configurations are properly documented for secure and accurate onboarding.' :
                  currentPhase.owner === 'approval' ? 'Gives you full control and visibility — nothing proceeds without your explicit sign-off.' :
                  currentPhase.owner === 'automatic' ? 'Automated processing reduces your wait time and ensures consistent, repeatable results.' :
                  'AskABD validates your environment against enterprise standards, protecting your data and ensuring compliance before any access is granted.'
                }</p>
              </div>
              <div>
                <p className="font-semibold text-purple-700 mb-1">🏢 Value to AskABD</p>
                <p className="text-purple-700">{
                  currentPhase.owner === 'client' ? 'Accurate client-provided information enables AskABD to deliver precise discovery, assessment, and migration without guesswork.' :
                  currentPhase.owner === 'approval' ? 'Customer approval creates a clear audit trail and shared accountability for all subsequent actions.' :
                  currentPhase.owner === 'automatic' ? 'Automated execution maintains quality standards and generates evidence for governance and compliance.' :
                  'Completing this validation allows AskABD to proceed with confidence that the platform meets security and operational requirements.'
                }</p>
              </div>
            </div>
          </div>

          {/* Requirement Status (from backend readiness) */}
          <div className="mb-4">
            {/* Validation checks with purpose and how-to */}
            {currentPhase.checks.some(c => c.purpose || c.howTo) && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-700 mb-3">Validation Checks — What & How</p>
                <div className="space-y-2">
                  {currentPhase.checks.map(check => (
                    <div key={check.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px]">🔍</span>
                        <p className="text-xs font-semibold text-gray-800">{check.label}</p>
                      </div>
                      {check.purpose && (
                        <div className="mt-1.5 pl-5">
                          <p className="text-[10px] text-gray-500 font-medium">Purpose:</p>
                          <p className="text-[10px] text-gray-700">{check.purpose}</p>
                        </div>
                      )}
                      {check.howTo && (
                        <div className="mt-1.5 pl-5">
                          <p className="text-[10px] text-gray-500 font-medium">How to do it:</p>
                          <p className="text-[10px] text-gray-700">{check.howTo}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {readinessData && requirements.length > 0 ? (
              <>
                <p className="text-xs font-semibold text-gray-700 mb-3">Service Requirements ({readinessData.requiredProvided}/{readinessData.required} complete)</p>
                <div className="space-y-2">
                  {requirements.filter((r: any) => r.required).map((req: any) => {
                    const isComplete = req.status === 'provided' || req.status === 'valid';
                    return (
                      <div key={req.requirementKey} className={`flex items-start gap-3 p-3 rounded-lg border ${isComplete ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isComplete ? 'bg-green-500' : 'bg-amber-400'}`}>
                          <span className="text-white text-[10px] font-bold">{isComplete ? '✓' : '!'}</span>
                        </div>
                        <div className="flex-1">
                          <p className={`text-xs font-medium ${isComplete ? 'text-green-700' : 'text-gray-800'}`}>{req.requirementName}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{req.description}</p>
                        </div>
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${isComplete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {isComplete ? 'PROVIDED' : 'REQUIRED'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {readinessData.blockers?.length > 0 && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-amber-700 mb-1">Blockers ({readinessData.blockers.length})</p>
                    {readinessData.blockers.slice(0, 3).map((b: any, i: number) => (
                      <p key={i} className="text-[10px] text-amber-600">• {b.message}</p>
                    ))}
                  </div>
                )}
                {/* Inline Requirement Workspace — allows user to provide/edit values */}
                <div className="mt-4 pt-3 border-t">
                  <RequirementWorkspace clientId={clientId} serviceId={currentServiceReq?.serviceId || ''} serviceName={currentPhase.title} onSaveComplete={loadReadiness} />
                </div>
              </>
            ) : (
              <>
                <OperationStatusPanel clientId={clientId} status={state.status} />
              </>
            )}
          </div>

          {/* Action Button */}
          <div className="flex items-center gap-2">
            <button onClick={advancePhase} disabled={!allChecksComplete() || processing}
              className={`flex-1 py-3 rounded-lg text-sm font-semibold transition ${allChecksComplete() ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
              {processing ? 'Processing...' : allChecksComplete() ? `${currentPhase.actionLabel} →` : readinessData ? `Complete required information to proceed` : `Complete all checks to proceed`}
            </button>
            {readinessData && !allChecksComplete() && (
              <button onClick={loadReadiness} className="text-[9px] text-purple-600 hover:text-purple-800 font-medium px-2 py-3 border rounded-lg hover:bg-purple-50 transition shrink-0">↻ Refresh</button>
            )}
          </div>

          {!allChecksComplete() && (
            <p className="text-[10px] text-amber-600 text-center mt-2">⚠ {readinessData ? `${readinessData.blockers?.length || 0} requirement(s) still needed. Save information above — this updates automatically.` : 'All validation checks must pass before proceeding.'}</p>
          )}
        </div>
      ) : (
        <div className="bg-green-50 rounded-xl border border-green-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
              <span className="text-2xl">🎉</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-green-800">Lifecycle 100% Complete</h3>
              <p className="text-sm text-green-600">{client?.name || state.organizationName} — Full enterprise lifecycle delivered</p>
            </div>
          </div>

          {/* Ongoing Service — NOT a dead end */}
          <div className="bg-white rounded-lg border border-green-200 p-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] text-green-600 font-semibold uppercase">Ongoing Service</p>
                <p className="text-sm font-bold text-gray-900">Continuous Engineering Intelligence</p>
              </div>
              <span className="text-[9px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded">ASKABD — ONGOING</span>
            </div>
            <p className="text-xs text-gray-600 mb-4">AskABD continues to deliver engineering intelligence, operational monitoring, incident analysis, and optimization recommendations as an ongoing managed service.</p>

            <div className="grid md:grid-cols-2 gap-2 mb-4">
              <div className="text-[10px] text-gray-600 bg-gray-50 p-2 rounded">✓ Automated root cause analysis</div>
              <div className="text-[10px] text-gray-600 bg-gray-50 p-2 rounded">✓ Operational intelligence</div>
              <div className="text-[10px] text-gray-600 bg-gray-50 p-2 rounded">✓ Engineering recommendations</div>
              <div className="text-[10px] text-gray-600 bg-gray-50 p-2 rounded">✓ Continuous monitoring</div>
              <div className="text-[10px] text-gray-600 bg-gray-50 p-2 rounded">✓ Incident detection & response</div>
              <div className="text-[10px] text-gray-600 bg-gray-50 p-2 rounded">✓ Service health analysis</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href={`/clients/${clientId}/engineering`} className="text-[10px] font-semibold bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded transition">Engineering →</Link>
              <Link href={`/clients/${clientId}/monitoring`} className="text-[10px] font-medium text-purple-600 border border-purple-200 px-3 py-1.5 rounded hover:bg-purple-50 transition">Monitoring</Link>
              <Link href={`/clients/${clientId}/incidents`} className="text-[10px] font-medium text-purple-600 border border-purple-200 px-3 py-1.5 rounded hover:bg-purple-50 transition">Incidents</Link>
              <Link href={`/clients/${clientId}/reports`} className="text-[10px] font-medium text-purple-600 border border-purple-200 px-3 py-1.5 rounded hover:bg-purple-50 transition">Reports</Link>
              <Link href={`/clients/${clientId}/audit`} className="text-[10px] font-medium text-purple-600 border border-purple-200 px-3 py-1.5 rounded hover:bg-purple-50 transition">Audit</Link>
            </div>
          </div>
        </div>
      )}

      {/* Timeline — derived entirely from canonical statusMeta */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-xs font-semibold text-gray-700 mb-3">Complete Lifecycle Timeline</h3>
        <div className="space-y-1">
          {allStatuses.filter(s => (statusMeta[s]?.order ?? 0) >= 3).map((s, i) => {
            const meta = statusMeta[s];
            if (!meta) return null;
            const stepNum = i + 1;
            const isComplete = meta.order <= currentOrder;
            const isCurrent = meta.order === currentOrder;
            const isNext = meta.order === currentOrder + 1;
            const phaseEntry = phases.find(p => p.status === s);
            const ownerTag = phaseEntry ? ownerLabels[phaseEntry.owner] : null;
            return (
              <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs ${isNext ? 'bg-purple-50 border border-purple-200' : isCurrent ? 'bg-green-50/70 border border-green-200' : isComplete ? 'bg-green-50/40' : ''}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${isComplete ? 'bg-green-500 text-white' : isNext ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {isComplete ? '✓' : stepNum}
                </div>
                <span className={`flex-1 text-[13px] ${isNext ? 'font-semibold text-purple-700' : isComplete ? 'font-medium text-green-700' : 'text-gray-500'}`}>{meta.label}</span>
                {ownerTag && isNext && <span className={`text-[9px] font-medium px-2 py-0.5 rounded ${ownerTag.color}`}>{ownerTag.label}</span>}
                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded min-w-[60px] text-center ${isComplete ? 'bg-green-100 text-green-700' : isNext ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'}`}>
                  {isComplete ? 'PASSED' : isNext ? 'CURRENT' : 'FUTURE'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event History */}
      {(state.events?.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-xs font-semibold text-gray-700 mb-3">Event History</h3>
          <div className="space-y-1.5">
            {(state.events ?? []).slice().reverse().slice(0, 10).map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] px-2 py-1.5 rounded bg-gray-50">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                <span className="text-gray-700 font-medium">{e.event.replace(/_/g, ' ')}</span>
                <span className="text-gray-400 ml-auto">{new Date(e.timestamp).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
