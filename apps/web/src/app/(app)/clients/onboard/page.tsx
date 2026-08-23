'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Breadcrumb } from '../../../components/breadcrumb';
import { serviceCatalog } from '../../../lib/service-catalog';
import { createClient, logAuditEvent } from '../../../lib/operations-api';
import { sendNotification, getStandardSubject } from '../../../lib/notifications';
import { createLifecycleState, processWorkflowEvent, persistLifecycleState } from '../../../lib/onboarding-lifecycle';

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const industries = [
  'Financial Services', 'Healthcare', 'Technology', 'Information Technology', 'Manufacturing', 'Retail & E-Commerce',
  'Education', 'Government', 'Logistics & Supply Chain', 'Real Estate', 'Energy & Utilities',
  'Telecommunications', 'Media & Entertainment', 'Legal', 'Insurance', 'Hospitality',
  'Agriculture', 'Automotive', 'Aerospace & Defense', 'Non-Profit', 'Other',
];

const countries = [
  { name: 'Australia', timezone: 'Australia/Sydney' },
  { name: 'United States', timezone: 'America/New_York' },
  { name: 'United Kingdom', timezone: 'Europe/London' },
  { name: 'Canada', timezone: 'America/Toronto' },
  { name: 'India', timezone: 'Asia/Kolkata' },
  { name: 'Singapore', timezone: 'Asia/Singapore' },
  { name: 'United Arab Emirates', timezone: 'Asia/Dubai' },
  { name: 'Germany', timezone: 'Europe/Berlin' },
  { name: 'Japan', timezone: 'Asia/Tokyo' },
  { name: 'New Zealand', timezone: 'Pacific/Auckland' },
  { name: 'South Africa', timezone: 'Africa/Johannesburg' },
  { name: 'Brazil', timezone: 'America/Sao_Paulo' },
  { name: 'France', timezone: 'Europe/Paris' },
  { name: 'Netherlands', timezone: 'Europe/Amsterdam' },
  { name: 'Ireland', timezone: 'Europe/Dublin' },
  { name: 'Malaysia', timezone: 'Asia/Kuala_Lumpur' },
  { name: 'Philippines', timezone: 'Asia/Manila' },
  { name: 'Saudi Arabia', timezone: 'Asia/Riyadh' },
  { name: 'South Korea', timezone: 'Asia/Seoul' },
  { name: 'Sweden', timezone: 'Europe/Stockholm' },
  { name: 'Other', timezone: '' },
];

const businessSizes = ['Startup (1-10)', 'Small (11-50)', 'Medium (51-200)', 'Large (201-500)', 'Enterprise (500+)', 'Corporate (5000+)', 'Other'];
const supportModels = ['24/7 Managed Services', 'Business Hours Support', 'Dedicated Team', 'Self-Service with Escalation', 'Premium SLA', 'Other'];
const criticalities = ['Critical — Zero tolerance', 'High — Revenue generating', 'Medium — Business supporting', 'Low — Internal tools', 'Other'];
const departmentOptions = ['Engineering', 'Operations', 'Finance', 'Sales', 'Marketing', 'HR', 'Legal', 'Product', 'Customer Success', 'Other'];
const capabilityOptions = ['Customer Management', 'Billing', 'Reporting', 'Analytics', 'Payments', 'Notifications', 'Authentication', 'Inventory', 'Logistics', 'Other'];
const processOptions = ['Order Processing', 'Customer Onboarding', 'Invoicing', 'Support Ticketing', 'Compliance Reporting', 'Data Migration', 'Other'];
const techAppOptions = ['React', 'Angular', 'Vue.js', 'Next.js', 'Node.js', '.NET', 'Java', 'Python', 'Go', 'Ruby on Rails', 'Other'];
const serviceOptions = ['Authentication', 'Payment', 'Notification', 'Search', 'Email', 'File Storage', 'Analytics', 'Messaging', 'Other'];
const apiOptions = ['REST', 'GraphQL', 'gRPC', 'WebSocket', 'SOAP', 'Other'];
const dbOptions = ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'DynamoDB', 'SQL Server', 'Elasticsearch', 'Other'];
const serverOptions = ['AWS EC2', 'AWS ECS', 'AWS Lambda', 'Azure VMs', 'Google Cloud Run', 'Bare Metal', 'Other'];
const cloudOptions = ['AWS', 'Azure', 'GCP', 'DigitalOcean', 'Heroku', 'On-Premise', 'Hybrid', 'Other'];
const infraOptions = ['Kubernetes', 'Docker', 'Terraform', 'Ansible', 'CloudFormation', 'Serverless', 'Other'];

export default function OnboardClientPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyName: '', industry: '', country: '', timezone: '', size: '', supportModel: '', criticality: '',
    departments: [] as string[], capabilities: [] as string[], processes: [] as string[],
    businessOwner: '', applications: '',
    techApps: [] as string[], services: [] as string[], apis: [] as string[],
    databases: [] as string[], servers: [] as string[], cloud: [] as string[], infrastructure: [] as string[],
    envDev: true, envTest: true, envUat: false, envStaging: true, envProd: true, envDr: false,
    monInfra: true, monApps: true, monServices: true, monDb: true, monNetwork: false, monCloud: false,
    enabledServices: new Set<string>(),
    // Notification recipients
    notifyContacts: [
      { name: '', email: '', role: 'Primary Contact', phases: ['service-change', 'incident', 'remediation', 'resolution'] as string[] },
    ] as Array<{ name: string; email: string; role: string; phases: string[] }>,
  });
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const steps: { num: Step; title: string }[] = [
    { num: 1, title: 'Company Information' },
    { num: 2, title: 'Business Information' },
    { num: 3, title: 'Technology' },
    { num: 4, title: 'Environments' },
    { num: 5, title: 'Monitoring' },
    { num: 6, title: 'Services' },
  ];

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  function handleCountryChange(country: string) {
    const match = countries.find(c => c.name === country);
    // Real bug found and fixed during this pass's mandatory Playwright verification
    // (not a testing artifact): every setState call in this file previously read
    // `form`/`errors` from the React closure and wrote a direct object literal
    // (`setForm({...form, ...})`) instead of the functional-updater form. Under
    // React 18's automatic batching, two or more of these fired within the same
    // tick (proven via a real Playwright reproduction: three rapid, distinct
    // MultiSelect clicks) all read the SAME stale `form` snapshot, so only the
    // LAST call's change survived — the earlier selections were silently
    // discarded, not merged. Fixed throughout this file by switching every
    // setForm/setErrors call to the functional-updater form, which always reads
    // the true current state regardless of how many updates are batched together.
    setForm(prev => ({ ...prev, country, timezone: match?.timezone || '' }));
    setErrors(prev => ({ ...prev, country: false }));
  }

  function validateStep(s: Step): boolean {
    const newErrors: Record<string, boolean> = {};
    let missing: string[] = [];

    if (s === 1) {
      if (!form.companyName.trim()) { newErrors.companyName = true; missing.push('Company Name'); }
      if (!form.industry) { newErrors.industry = true; missing.push('Industry'); }
      if (!form.country) { newErrors.country = true; missing.push('Country'); }
      if (!form.size) { newErrors.size = true; missing.push('Business Size'); }
      if (!form.supportModel) { newErrors.supportModel = true; missing.push('Support Model'); }
      if (!form.criticality) { newErrors.criticality = true; missing.push('Criticality'); }
    }
    if (s === 2) {
      if (!form.businessOwner.trim()) { newErrors.businessOwner = true; missing.push('Business Owner'); }
      if (form.departments.length === 0) { newErrors.departments = true; missing.push('Departments'); }
    }
    if (s === 3) {
      if (form.techApps.length === 0) { newErrors.techApps = true; missing.push('Applications'); }
      if (form.databases.length === 0) { newErrors.databases = true; missing.push('Databases'); }
      if (form.cloud.length === 0) { newErrors.cloud = true; missing.push('Cloud Provider'); }
    }

    setErrors(newErrors);
    if (missing.length > 0) {
      showToast(`⚠ Missing required information: ${missing.join(', ')}. Please complete before proceeding.`);
      return false;
    }
    return true;
  }

  function handleNext() {
    if (!validateStep(step)) return;
    setStep(Math.min(6, step + 1) as Step);
  }

  function toggleMulti(field: 'departments' | 'capabilities' | 'processes' | 'techApps' | 'services' | 'apis' | 'databases' | 'servers' | 'cloud' | 'infrastructure', value: string) {
    setForm(prev => {
      const current = prev[field] as string[];
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, [field]: next };
    });
    setErrors(prev => ({ ...prev, [field]: false }));
  }

  function setAllMulti(field: 'departments' | 'capabilities' | 'processes' | 'techApps' | 'services' | 'apis' | 'databases' | 'servers' | 'cloud' | 'infrastructure', values: string[]) {
    setForm(prev => ({ ...prev, [field]: values }));
    setErrors(prev => ({ ...prev, [field]: false }));
  }

  const toggleService = (id: string) => {
    setForm(prev => {
      const next = new Set(prev.enabledServices);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...prev, enabledServices: next };
    });
  };

  async function completeOnboarding() {
    if (submitting) return; // Prevent duplicate submission
    setSubmitting(true);
    setSubmitStatus('Creating organization...');

    // Check for duplicate FIRST — if this org already exists and is in otp-sent, go to
    // verify without creating a second real client record.
    const existingClients = JSON.parse(localStorage.getItem('askabd-onboarded-clients') || '[]');
    const duplicate = Array.isArray(existingClients) ? existingClients.find((c: { name: string }) => c.name === form.companyName) : null;
    if (duplicate) {
      const existingLifecycle = localStorage.getItem(`askabd-lifecycle-${duplicate.id}`);
      if (existingLifecycle) {
        try {
          const ls = JSON.parse(existingLifecycle);
          if (ls?.status === 'otp-sent') {
            setSubmitting(false);
            router.push(`/verify?clientId=${encodeURIComponent(duplicate.id)}`);
            return;
          }
        } catch { /* proceed with new creation */ }
      }
    }

    // Create the real client record and use its real, database-assigned ID for
    // everything that follows (lifecycle, OTP, notifications, the /verify redirect).
    //
    // Found during the staff-workflow UAT: this function previously generated its own
    // client-side ID (`client-${Date.now()}`), used it for the ENTIRE rest of onboarding
    // (localStorage record, oc_lifecycle row, OTP row, notification, and the /verify
    // page), and only fired the real createClient() call afterward with `.catch(() =>
    // {})` — never reading its response. The result: a real `oc_clients` row DID get
    // created, but under a completely different (real, UUID-based) id that nothing else
    // in the app ever referenced. Every subsequent onboarding step, and the client's
    // entire Overview/Lifecycle/Requirements pages, operated on an orphan ID with no
    // corresponding `oc_clients` row — while the real row sat unused. The Services page
    // also correctly showed "0 confirmed" for the orphan ID because the real client
    // (and its confirmed services) live under the other ID entirely.
    setSubmitStatus('Persisting to database...');
    const createResult = await createClient({
      name: form.companyName,
      logo: form.companyName.substring(0, 2).toUpperCase(),
      industry: form.industry,
      country: form.country,
      timezone: form.timezone,
      businessSize: form.size,
      supportModel: form.supportModel,
      criticality: form.criticality,
      primaryContact: form.businessOwner,
      departments: form.departments,
      capabilities: form.capabilities,
      processes: form.processes,
      applications: form.applications.split(',').map(a => a.trim()).filter(Boolean),
      techApps: form.techApps,
      techServices: form.services,
      techApis: form.apis,
      techDatabases: form.databases,
      techServers: form.servers,
      techCloud: form.cloud,
      techInfrastructure: form.infrastructure,
      environments: { dev: form.envDev, test: form.envTest, uat: form.envUat, staging: form.envStaging, prod: form.envProd, dr: form.envDr },
      monitoring: { infra: form.monInfra, apps: form.monApps, services: form.monServices, db: form.monDb, network: form.monNetwork, cloud: form.monCloud },
      enabledServices: Array.from(form.enabledServices),
      metadata: { onboardedVia: 'wizard', onboardedAt: new Date().toISOString() },
    }).catch(() => null);

    if (!createResult?.client?.id) {
      // The real API call failed — do NOT proceed with a fabricated ID. A client
      // created under a fake ID is an orphan: no oc_clients row, no services, no
      // requirements, nothing staff can find in the real client directory.
      setSubmitting(false);
      setSubmitStatus(null);
      showToast('⚠ Could not create the client record. Please check your connection and try again.');
      return;
    }
    const newClient = {
      id: createResult.client.id,
      name: form.companyName,
      logo: form.companyName.substring(0, 2).toUpperCase(),
      industry: form.industry,
      country: form.country,
      timezone: form.timezone,
      size: form.size,
      supportModel: form.supportModel,
      criticality: form.criticality,
      departments: form.departments,
      capabilities: form.capabilities,
      processes: form.processes,
      businessOwner: form.businessOwner,
      applications: form.applications.split(',').map(a => a.trim()).filter(Boolean),
      techStack: { apps: form.techApps, services: form.services, apis: form.apis, databases: form.databases, servers: form.servers, cloud: form.cloud, infrastructure: form.infrastructure },
      environments: { dev: form.envDev, test: form.envTest, uat: form.envUat, staging: form.envStaging, prod: form.envProd, dr: form.envDr },
      monitoring: { infra: form.monInfra, apps: form.monApps, services: form.monServices, db: form.monDb, network: form.monNetwork, cloud: form.monCloud },
      enabledServices: Array.from(form.enabledServices),
      notifyContacts: form.notifyContacts.filter(c => c.name && c.email),
      onboardedAt: new Date().toISOString(),
      health: 'healthy',
      slaStatus: 'compliant',
      platformScore: 50,
      primaryContact: form.businessOwner,
    };

    // 1. Save to localStorage (immediate UI update) — still real-ID-keyed now.
    existingClients.push(newClient);
    localStorage.setItem('askabd-onboarded-clients', JSON.stringify(existingClients));

    // 2. Log audit event
    setSubmitStatus('Recording audit trail...');
    logAuditEvent({
      entityType: 'client',
      entityId: newClient.id,
      entityName: form.companyName,
      action: 'created',
      actor: form.businessOwner || 'hello@askabd.com',
      details: { industry: form.industry, country: form.country, size: form.size, criticality: form.criticality },
      evidence: [
        `Client "${form.companyName}" onboarded via wizard at ${new Date().toISOString()}`,
        `Industry: ${form.industry}, Country: ${form.country}, Size: ${form.size}`,
        `Tech stack: ${form.techApps.join(', ')}`,
        `Services enabled: ${Array.from(form.enabledServices).length}`,
      ],
    }).catch(() => { /* graceful fallback */ });

    // 3. Send onboarding notification
    const recipients = form.notifyContacts.filter(c => c.name && c.email);
    if (recipients.length > 0) {
      sendNotification({
        clientId: newClient.id,
        clientName: form.companyName,
        phase: 'onboarding',
        priority: 'medium',
        subject: getStandardSubject('onboarding', 'Completed', form.companyName),
        summary: `${form.companyName} has been successfully onboarded to the AskABD Enterprise Operations Centre.`,
        details: {
          action: 'Client Onboarding Completed',
          performedBy: form.businessOwner || 'hello@askabd.com',
          timestamp: new Date().toISOString(),
          environment: 'All environments configured',
          impactLevel: 'None — new client setup',
          affectedServices: Array.from(form.enabledServices),
          nextSteps: 'Verification email sent. Business owner must verify identity via OTP.',
        },
        recipients: recipients as any,
        evidence: [
          `Client "${form.companyName}" onboarded at ${new Date().toISOString()}`,
          `Industry: ${form.industry}, Country: ${form.country}`,
          `Business Size: ${form.size}, Criticality: ${form.criticality}`,
          `Enabled Services: ${Array.from(form.enabledServices).length}`,
        ],
      }).catch(() => { /* graceful */ });
    }

    // 4. Create lifecycle state → organization-created → otp-sent
    setSubmitStatus('Initializing lifecycle...');
    const lifecycleState = createLifecycleState(newClient.id, form.companyName);
    let currentState = processWorkflowEvent(lifecycleState, 'organization_created', form.businessOwner || 'hello@askabd.com', 'Onboarding wizard completed — OTP verification initiated');
    if (currentState) {
      currentState.verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      persistLifecycleState(currentState);
    } else {
      persistLifecycleState(lifecycleState);
    }

    // 5. Send OTP email via API — MUST succeed before navigating to /verify
    setSubmitStatus('Sending verification email...');
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
    let emailSent = false;
    try {
      const otpRes = await fetch(API + '/api/v1/oc/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: newClient.id,
          clientName: form.companyName,
          businessOwner: form.businessOwner,
          email: form.businessOwner,
          onboardingData: {
            companyName: form.companyName,
            industry: form.industry,
            country: form.country,
            size: form.size,
            supportModel: form.supportModel,
            criticality: form.criticality,
            departments: form.departments,
            capabilities: form.capabilities,
            processes: form.processes,
            applications: form.applications,
            techApps: form.techApps,
            databases: form.databases,
            cloud: form.cloud,
            infrastructure: form.infrastructure,
            services: Array.from(form.enabledServices),
          },
        }),
      });
      if (otpRes.ok) {
        const otpData = await otpRes.json();
        emailSent = otpData.emailStatus === 'sent';
      }
    } catch {
      emailSent = false;
    }

    // 6. Navigate based on email send result
    if (emailSent) {
      // SUCCESS: Navigate directly to verification page with the real client ID
      router.push(`/verify?clientId=${encodeURIComponent(newClient.id)}`);
    } else {
      // FAILURE: Organization created but email failed — show retry option
      setSubmitting(false);
      setSubmitStatus(null);
      showToast('⚠ Organization created, but verification email could not be sent. Please retry or navigate to verification manually.');
      // Still navigate to verify — the page will show the client and allow resend
      setTimeout(() => {
        router.push(`/verify?clientId=${encodeURIComponent(newClient.id)}`);
      }, 2000);
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 relative">
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-5 py-3 rounded-lg shadow-xl text-sm font-medium max-w-lg text-center animate-in">
          {toast}
        </div>
      )}

      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Clients', href: '/clients' }, { label: 'Onboard New Client' }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Client Onboarding Wizard</h1>
      <p className="text-sm text-gray-500 mb-6">Set up a new client in the Enterprise Operations Center</p>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto">
        {steps.map(s => (
          <button key={s.num} onClick={() => { if (s.num < step) setStep(s.num); }} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${step === s.num ? 'bg-purple-100 text-purple-700 border border-purple-200' : step > s.num ? 'bg-green-50 text-green-700 border border-green-200 cursor-pointer' : 'bg-gray-50 text-gray-500 border border-gray-200 cursor-default'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === s.num ? 'bg-purple-600 text-white' : step > s.num ? 'bg-green-500 text-white' : 'bg-gray-300 text-white'}`}>{step > s.num ? '✓' : s.num}</span>
            {s.title}
          </button>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg mb-4">Company Information</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Company Name" value={form.companyName} onChange={v => { setForm(prev => ({...prev, companyName: v})); setErrors(prev => ({...prev, companyName: false})); }} placeholder="Enter company name" required error={errors.companyName} />
              <SelectField label="Industry" value={form.industry} onChange={v => { setForm(prev => ({...prev, industry: v})); setErrors(prev => ({...prev, industry: false})); }} options={industries} placeholder="Select industry…" required error={errors.industry} />
              <SelectField label="Country" value={form.country} onChange={handleCountryChange} options={countries.map(c => c.name)} placeholder="Select country…" required error={errors.country} />
              <Field label="Timezone" value={form.timezone} onChange={v => setForm(prev => ({...prev, timezone: v}))} placeholder="Auto-selected from country" disabled={form.country !== 'Other'} />
              <SelectField label="Business Size" value={form.size} onChange={v => { setForm(prev => ({...prev, size: v})); setErrors(prev => ({...prev, size: false})); }} options={businessSizes} placeholder="Select size…" required error={errors.size} />
              <SelectField label="Support Model" value={form.supportModel} onChange={v => { setForm(prev => ({...prev, supportModel: v})); setErrors(prev => ({...prev, supportModel: false})); }} options={supportModels} placeholder="Select model…" required error={errors.supportModel} />
              <SelectField label="Criticality" value={form.criticality} onChange={v => { setForm(prev => ({...prev, criticality: v})); setErrors(prev => ({...prev, criticality: false})); }} options={criticalities} placeholder="Select level…" required error={errors.criticality} />
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg mb-4">Business Information</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <MultiSelect label="Departments" selected={form.departments} options={departmentOptions} onToggle={v => toggleMulti('departments', v)} onSetAll={v => setAllMulti('departments', v)} required error={errors.departments} />
              <MultiSelect label="Business Capabilities" selected={form.capabilities} options={capabilityOptions} onToggle={v => toggleMulti('capabilities', v)} onSetAll={v => setAllMulti('capabilities', v)} />
              <MultiSelect label="Business Processes" selected={form.processes} options={processOptions} onToggle={v => toggleMulti('processes', v)} onSetAll={v => setAllMulti('processes', v)} />
              <Field label="Business Owner" value={form.businessOwner} onChange={v => { setForm(prev => ({...prev, businessOwner: v})); setErrors(prev => ({...prev, businessOwner: false})); }} placeholder="john.smith@acme.com" required error={errors.businessOwner} />
              <Field label="Applications (comma-separated)" value={form.applications} onChange={v => setForm(prev => ({...prev, applications: v}))} placeholder="Customer Portal, Admin Dashboard" />
            </div>

            {/* Notification Recipients */}
            <div className="mt-6 pt-4 border-t">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">📧 Notification Recipients</h3>
                  <p className="text-[10px] text-gray-500">Who should receive email notifications for this client? Assign phases per contact.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({...prev, notifyContacts: [...prev.notifyContacts, { name: '', email: '', role: '', phases: ['service-change'] }]}))}
                  className="text-[10px] font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-md border border-purple-200 transition"
                >
                  + Add Recipient
                </button>
              </div>
              <div className="space-y-3">
                {form.notifyContacts.map((contact, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                    <div className="grid md:grid-cols-3 gap-3 mb-2">
                      <input
                        type="text" placeholder="Full Name *" value={contact.name}
                        onChange={e => { const v = e.target.value; setForm(prev => { const next = [...prev.notifyContacts]; next[idx] = { ...next[idx], name: v }; return {...prev, notifyContacts: next}; }); }}
                        className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <input
                        type="email" placeholder="Email *" value={contact.email}
                        onChange={e => { const v = e.target.value; setForm(prev => { const next = [...prev.notifyContacts]; next[idx] = { ...next[idx], email: v }; return {...prev, notifyContacts: next}; }); }}
                        className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={contact.role}
                          onChange={e => { const v = e.target.value; setForm(prev => { const next = [...prev.notifyContacts]; next[idx] = { ...next[idx], role: v }; return {...prev, notifyContacts: next}; }); }}
                          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">Role…</option>
                          <option value="Primary Contact">Primary Contact</option>
                          <option value="Technical Lead">Technical Lead</option>
                          <option value="Engineering Manager">Engineering Manager</option>
                          <option value="CTO">CTO</option>
                          <option value="Operations Manager">Operations Manager</option>
                          <option value="Project Manager">Project Manager</option>
                          <option value="Other">Other</option>
                        </select>
                        {form.notifyContacts.length > 1 && (
                          <button onClick={() => setForm(prev => ({...prev, notifyContacts: prev.notifyContacts.filter((_, i) => i !== idx)}))} className="text-red-400 hover:text-red-600 text-sm" title="Remove">✕</button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[9px] text-gray-500 py-0.5">Notify for:</span>
                      {(['onboarding', 'service-change', 'incident', 'remediation', 'deployment', 'maintenance', 'escalation', 'resolution'] as const).map(phase => (
                        <button
                          key={phase} type="button"
                          onClick={() => setForm(prev => {
                            const next = [...prev.notifyContacts];
                            const phases = next[idx].phases.includes(phase) ? next[idx].phases.filter(p => p !== phase) : [...next[idx].phases, phase];
                            next[idx] = { ...next[idx], phases };
                            return {...prev, notifyContacts: next};
                          })}
                          className={`text-[9px] font-medium px-1.5 py-0.5 rounded transition ${contact.phases.includes(phase) ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}
                        >
                          {phase}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg mb-4">Technology Stack</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <MultiSelect label="Applications" selected={form.techApps} options={techAppOptions} onToggle={v => toggleMulti('techApps', v)} onSetAll={v => setAllMulti('techApps', v)} required error={errors.techApps} />
              <MultiSelect label="Services" selected={form.services} options={serviceOptions} onToggle={v => toggleMulti('services', v)} onSetAll={v => setAllMulti('services', v)} />
              <MultiSelect label="APIs" selected={form.apis} options={apiOptions} onToggle={v => toggleMulti('apis', v)} onSetAll={v => setAllMulti('apis', v)} />
              <MultiSelect label="Databases" selected={form.databases} options={dbOptions} onToggle={v => toggleMulti('databases', v)} onSetAll={v => setAllMulti('databases', v)} required error={errors.databases} />
              <MultiSelect label="Servers" selected={form.servers} options={serverOptions} onToggle={v => toggleMulti('servers', v)} onSetAll={v => setAllMulti('servers', v)} />
              <MultiSelect label="Cloud Provider" selected={form.cloud} options={cloudOptions} onToggle={v => toggleMulti('cloud', v)} onSetAll={v => setAllMulti('cloud', v)} required error={errors.cloud} />
              <MultiSelect label="Infrastructure" selected={form.infrastructure} options={infraOptions} onToggle={v => toggleMulti('infrastructure', v)} onSetAll={v => setAllMulti('infrastructure', v)} />
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg mb-4">Environments</h2>
            <p className="text-xs text-gray-500 mb-4">Select which environments this client operates</p>
            <div className="grid md:grid-cols-3 gap-3">
              <Toggle label="Development" checked={form.envDev} onChange={v => setForm(prev => ({...prev, envDev: v}))} />
              <Toggle label="Testing / QA" checked={form.envTest} onChange={v => setForm(prev => ({...prev, envTest: v}))} />
              <Toggle label="UAT" checked={form.envUat} onChange={v => setForm(prev => ({...prev, envUat: v}))} />
              <Toggle label="Staging" checked={form.envStaging} onChange={v => setForm(prev => ({...prev, envStaging: v}))} />
              <Toggle label="Production" checked={form.envProd} onChange={v => setForm(prev => ({...prev, envProd: v}))} />
              <Toggle label="Disaster Recovery" checked={form.envDr} onChange={v => setForm(prev => ({...prev, envDr: v}))} />
            </div>
          </div>
        )}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg mb-4">Monitoring Configuration</h2>
            <p className="text-xs text-gray-500 mb-4">Enable monitoring for the following areas</p>
            <div className="grid md:grid-cols-3 gap-3">
              <Toggle label="Infrastructure" checked={form.monInfra} onChange={v => setForm(prev => ({...prev, monInfra: v}))} />
              <Toggle label="Applications" checked={form.monApps} onChange={v => setForm(prev => ({...prev, monApps: v}))} />
              <Toggle label="Services" checked={form.monServices} onChange={v => setForm(prev => ({...prev, monServices: v}))} />
              <Toggle label="Database" checked={form.monDb} onChange={v => setForm(prev => ({...prev, monDb: v}))} />
              <Toggle label="Network" checked={form.monNetwork} onChange={v => setForm(prev => ({...prev, monNetwork: v}))} />
              <Toggle label="Cloud Resources" checked={form.monCloud} onChange={v => setForm(prev => ({...prev, monCloud: v}))} />
            </div>
          </div>
        )}
        {step === 6 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg mb-4">AskABD Services</h2>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-500">Enable the services required for this client — {form.enabledServices.size} of {serviceCatalog.length} selected</p>
              <button
                onClick={() => setForm(prev => {
                  const allIds = serviceCatalog.map(s => s.id);
                  const allSelected = allIds.every(id => prev.enabledServices.has(id));
                  const next = new Set(allSelected ? [] as string[] : allIds);
                  return { ...prev, enabledServices: next };
                })}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 transition"
              >
                {serviceCatalog.every(s => form.enabledServices.has(s.id)) ? '✗ Deselect All' : '✓ Select All'}
              </button>
            </div>
            {/* Group by category */}
            {(['assessment', 'operations', 'transformation', 'governance', 'financial', 'intelligence', 'platform', 'support'] as const).map(cat => {
              const catServices = serviceCatalog.filter(s => s.category === cat);
              if (catServices.length === 0) return null;
              const catLabels: Record<string, string> = { assessment: '🔍 Health Check & Analysis', operations: '⚙️ Day-to-Day Operations', transformation: '🚀 Change & Modernization', governance: '🛡️ Compliance & Risk', financial: '💰 Billing & Payments', intelligence: '🧠 Insights & Recommendations', platform: '🖥️ Platform Tools', support: '📚 Knowledge & Support' };
              return (
                <div key={cat} className="mb-4">
                  <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">{catLabels[cat] || cat}</h3>
                  <div className="grid md:grid-cols-2 gap-2">
                    {catServices.map(svc => (
                      <button key={svc.id} onClick={() => toggleService(svc.id)} className={`p-3 rounded-lg border text-left transition ${form.enabledServices.has(svc.id) ? 'border-purple-300 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold text-gray-900">{svc.name}</p>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${form.enabledServices.has(svc.id) ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            {form.enabledServices.has(svc.id) ? 'ENABLED' : 'OFF'}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-600 leading-snug mb-1"><span className="font-medium">What it does:</span> {svc.description}</p>
                        <p className="text-[10px] text-purple-700 leading-snug"><span className="font-medium">How it helps you:</span> {svc.businessValue}</p>
                        <p className="text-[9px] text-gray-400 mt-1">Typical duration: {svc.expectedTimeline}</p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setStep(Math.max(1, step - 1) as Step)} disabled={step === 1 || submitting} className="text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed px-4 py-2 rounded-lg border hover:bg-gray-50 transition">← Previous</button>
        {step < 6 ? (
          <button onClick={handleNext} disabled={submitting} className="text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg transition disabled:opacity-50">Next →</button>
        ) : (
          <button onClick={completeOnboarding} disabled={submitting} className="text-sm font-medium text-white bg-green-600 hover:bg-green-700 px-6 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {submitStatus || 'Processing...'}
              </>
            ) : (
              'Complete Onboarding ✓'
            )}
          </button>
        )}
      </div>

      {/* Submission overlay */}
      {submitting && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-8 shadow-2xl max-w-sm text-center">
            <div className="w-12 h-12 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-semibold text-gray-900">{submitStatus || 'Processing...'}</p>
            <p className="text-[10px] text-gray-500 mt-2">Please wait while we set up your organization.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required, error, disabled }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; required?: boolean; error?: boolean; disabled?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition ${error ? 'border-red-400 bg-red-50' : 'border-gray-200'} ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
      />
      {error && <p className="text-[10px] text-red-500 mt-0.5">Required</p>}
    </div>
  );
}

function SelectField({ label, value, onChange, options, placeholder, required, error }: { label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder: string; required?: boolean; error?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition appearance-none bg-white ${error ? 'border-red-400 bg-red-50' : 'border-gray-200'} ${!value ? 'text-gray-400' : 'text-gray-900'}`}>
        <option value="" disabled>{placeholder}</option>
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      {error && <p className="text-[10px] text-red-500 mt-0.5">Required</p>}
    </div>
  );
}

function MultiSelect({ label, selected, options, onToggle, onSetAll, required, error }: { label: string; selected: string[]; options: string[]; onToggle: (v: string) => void; onSetAll?: (values: string[]) => void; required?: boolean; error?: boolean }) {
  const allSelected = options.length > 0 && options.every(opt => selected.includes(opt));

  const toggleAll = () => {
    if (onSetAll) {
      onSetAll(allSelected ? [] : [...options]);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-gray-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {onSetAll && (
          <button type="button" onClick={toggleAll} className={`relative w-9 h-5 rounded-full transition-colors ${allSelected ? 'bg-purple-600' : 'bg-gray-300'}`} title={allSelected ? 'Deselect all' : 'Select all'}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200 ${allSelected ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        )}
      </div>
      <div className={`border rounded-lg p-2 flex flex-wrap gap-1.5 min-h-[38px] ${error ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}>
        {options.map(opt => (
          <button key={opt} type="button" onClick={() => onToggle(opt)}
            className={`text-[10px] font-medium px-2 py-1 rounded-md transition ${selected.includes(opt) ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {opt}
          </button>
        ))}
      </div>
      {error && <p className="text-[10px] text-red-500 mt-0.5">Select at least one</p>}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`flex items-center justify-between p-3 rounded-lg border transition ${checked ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
      <span className="text-xs font-medium text-gray-800">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 ${checked ? 'bg-green-500' : 'bg-gray-300'}`}>
          <div className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-all duration-200 ${checked ? 'left-[14px]' : 'left-[2px]'}`} />
        </div>
        <span className={`text-[9px] font-bold uppercase w-6 ${checked ? 'text-green-600' : 'text-gray-400'}`}>{checked ? 'ON' : 'OFF'}</span>
      </div>
    </button>
  );
}
