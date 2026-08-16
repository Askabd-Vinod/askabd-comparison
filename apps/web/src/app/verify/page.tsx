'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Breadcrumb } from '../components/breadcrumb';
import { getLifecycleState, persistLifecycleState, requestLifecycleTransition, fetchServerLifecycle, type LifecycleState } from '../lib/onboarding-lifecycle';
import { logAuditEvent } from '../lib/operations-api';

interface OnboardedClient {
  id: string; name: string; industry: string; country: string; timezone: string;
  size: string; supportModel: string; criticality: string; businessOwner: string;
  departments?: string[]; capabilities?: string[]; processes?: string[];
  techStack?: { apps?: string[]; services?: string[]; apis?: string[]; databases?: string[]; servers?: string[]; cloud?: string[]; infrastructure?: string[] };
  environments?: Record<string, boolean>;
  monitoring?: Record<string, boolean>;
  enabledServices?: string[];
}

export default function VerifyPageWrapper() {
  return (
    <Suspense fallback={<div className="max-w-lg mx-auto px-4 py-12 text-center"><p className="text-sm text-gray-500">Loading verification...</p></div>}>
      <VerifyPage />
    </Suspense>
  );
}

function VerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [state, setState] = useState<LifecycleState | null>(null);
  const [client, setClient] = useState<OnboardedClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [resent, setResent] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const clientIdParam = searchParams.get('clientId');

    if (clientIdParam) {
      // Load specific client by ID from URL param
      const lifecycleState = getLifecycleState(clientIdParam);
      if (lifecycleState) {
        setState(lifecycleState);
        loadClientData(clientIdParam);
      } else {
        // Client lifecycle not found — maybe invalid ID
        setNotFound(true);
      }
    } else {
      // Fallback: find the most recent client in otp-sent state
      const keys = Object.keys(localStorage).filter(k => k.startsWith('askabd-lifecycle-'));
      let found = false;
      for (const key of keys) {
        try {
          const s = JSON.parse(localStorage.getItem(key) || '');
          if (s?.status === 'otp-sent') {
            setState(s);
            loadClientData(s.organizationId);
            found = true;
            break;
          }
        } catch { /* skip */ }
      }
      if (!found) setNotFound(true);
    }
  }, [searchParams]);

  function loadClientData(clientId: string) {
    try {
      const clients = JSON.parse(localStorage.getItem('askabd-onboarded-clients') || '[]');
      const match = Array.isArray(clients) ? clients.find((c: OnboardedClient) => c.id === clientId) : null;
      if (match) setClient(match);
    } catch { /* skip */ }
  }

  function handleInput(index: number, value: string) {
    if (value.length > 1) value = value[0];
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    setError(null);
    if (value && index < 5) {
      const el = document.getElementById(`otp-${index + 1}`);
      if (el) (el as HTMLInputElement).focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const el = document.getElementById(`otp-${index - 1}`);
      if (el) (el as HTMLInputElement).focus();
    }
  }

  async function verifyOtp() {
    if (locked) return;
    const entered = otp.join('');
    if (entered.length !== 6) { setError('Please enter all 6 digits'); return; }

    // Validate OTP via server-side API (OTP is NEVER stored on frontend)
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
    try {
      const res = await fetch(API + '/api/v1/oc/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: state?.organizationId, otp: entered }),
      });
      const data = await res.json();

      if (!data.valid) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= 5) {
          setLocked(true);
          setError('Too many failed attempts. Your verification has been temporarily locked. Please request a new OTP or contact support at hello@askabd.com.');
          return;
        }
        setError(data.error || 'Incorrect OTP. Please check the code and try again.');
        return;
      }
    } catch {
      // API unreachable — allow demo OTP '123456' as fallback for local dev
      if (entered !== '123456') {
        setError('Verification service unavailable. Please try again or use demo OTP 123456.');
        return;
      }
    }

    // OTP verified — progress lifecycle to OTP Verified, then auto-advance to identity-verified
    // since the identity requirements were auto-populated from onboarding data during OTP verification
    if (state) {
      // Use server-side lifecycle transition (PostgreSQL authoritative)
      let currentState = state;
      const updated = await requestLifecycleTransition(state.organizationId, 'otp_verified', 'admin', 'OTP verified successfully via email');
      if (updated) {
        setState(updated);
        currentState = updated;
      } else {
        // Server transition failed — fallback to persist locally (may be already at otp-verified)
        persistLifecycleState({ ...state, status: 'otp-verified', previousStatus: 'otp-sent', updatedAt: new Date().toISOString() });
      }

      // Auto-advance: try identity_verified transition (will succeed if requirements were auto-populated)
      if (currentState.status === 'otp-verified') {
        const identityResult = await requestLifecycleTransition(currentState.organizationId, 'identity_verified', 'system', 'Identity auto-verified from onboarding data');
        if (identityResult) {
          setState(identityResult);
        }
        // If it fails (requirements not ready), that's fine — user will fill them on the lifecycle page
      }

      logAuditEvent({
        entityType: 'verification', entityId: state.organizationId, entityName: state.organizationName,
        action: 'otp_verified', actor: 'admin',
        details: { attempts: attempts + 1, verifiedAt: new Date().toISOString() },
        evidence: [
          `OTP verified after ${attempts + 1} attempt(s) at ${new Date().toISOString()}`,
          `Organization: ${state.organizationName}`,
          `Lifecycle transitioned: otp-sent → otp-verified`,
        ],
      }).catch(() => {});
    }
    setSuccess(true);
    setTimeout(() => router.push(`/clients/${state.organizationId}/lifecycle`), 3000);
  }

  async function resendOtp() {
    if (!state) return;
    setError(null);
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
    try {
      const res = await fetch(API + '/api/v1/oc/otp/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: state.organizationId,
          clientName: state.organizationName,
          email: client?.businessOwner || state.organizationName,
        }),
      });
      if (res.ok) {
        // Server generates new OTP, invalidates old, sends email
        // Frontend resets UI state only
        setOtp(['', '', '', '', '', '']);
        setError(null);
        setAttempts(0);
        setLocked(false);
        setResent(true);
        setTimeout(() => setResent(false), 4000);
      } else {
        const errData = await res.json().catch(() => null);
        if (res.status === 500 && errData?.error?.code === 'email_failed') {
          setError(`Email delivery failed: ${errData.error.message}. Please try again.`);
        } else if (res.status === 500 && errData?.error?.code === 'email_not_configured') {
          setError('Email service is not configured on the server.');
        } else {
          setError(errData?.error?.message || `Resend failed (HTTP ${res.status}). Please try again.`);
        }
      }
    } catch {
      // Retry once silently before showing error
      try {
        const retryRes = await fetch(API + '/api/v1/oc/otp/resend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: state.organizationId,
            clientName: state.organizationName,
            email: client?.businessOwner || state.organizationName,
          }),
        });
        if (retryRes.ok) {
          setOtp(['', '', '', '', '', '']);
          setError(null);
          setAttempts(0);
          setLocked(false);
          setResent(true);
          setTimeout(() => setResent(false), 4000);
          return;
        }
      } catch { /* retry also failed */ }
      setError('Service temporarily unavailable. Please wait a moment and try again.');
    }
  }

  // ─── NO PENDING VERIFICATION ───────────────────────────────────────────────
  if (notFound || !state) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Verify' }]} />
        <div className="mt-8 bg-white rounded-xl border p-8 shadow-sm">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-xl">🔐</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900">
            {searchParams.get('clientId') ? 'Verification Request Not Found' : 'No Pending Verification'}
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            {searchParams.get('clientId')
              ? `Could not find a verification request for client "${searchParams.get('clientId')}".`
              : 'There are no organizations awaiting OTP verification.'}
          </p>
          <p className="text-xs text-gray-400 mt-1">Complete the onboarding wizard first to receive a verification code.</p>
          <button onClick={() => router.push('/clients/onboard')} className="mt-6 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 px-5 py-2.5 rounded-lg transition">
            Start Onboarding →
          </button>
        </div>
      </div>
    );
  }

  // ─── SUCCESS STATE ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Verify' }]} />
        <div className="mt-8 bg-green-50 border border-green-200 rounded-xl p-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✓</span>
          </div>
          <h2 className="text-lg font-bold text-green-800">OTP Verification Successful</h2>
          <p className="text-sm text-green-600 mt-2"><strong>{state.organizationName}</strong> identity has been verified.</p>
          <p className="text-xs text-green-500 mt-1">Lifecycle status: <span className="font-mono font-semibold">OTP Verified</span></p>
          <p className="text-[10px] text-gray-400 mt-4">Redirecting to lifecycle journey…</p>
        </div>
      </div>
    );
  }

  // Calculate expiry display
  const expiryTime = state.verificationExpiry ? new Date(state.verificationExpiry) : null;
  const isExpired = expiryTime ? expiryTime < new Date() : false;
  const expiryDisplay = expiryTime
    ? expiryTime.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Unknown';

  // Active environments
  const activeEnvs = client?.environments
    ? Object.entries(client.environments).filter(([, v]) => v).map(([k]) => k)
    : [];

  // Active monitoring
  const activeMonitoring = client?.monitoring
    ? Object.entries(client.monitoring).filter(([, v]) => v).map(([k]) => k)
    : [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Clients', href: '/clients' }, { label: 'Verify Business Owner' }]} />

      {/* Status Banner */}
      <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 flex items-center gap-3">
        <span className="text-lg">📧</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-yellow-800">OTP Sent — Awaiting Verification</p>
          <p className="text-[10px] text-yellow-600">A verification code has been sent to the business owner&apos;s email address.</p>
        </div>
        <span className="text-[10px] font-mono bg-yellow-100 text-yellow-700 px-2 py-1 rounded">otp-sent</span>
      </div>

      {/* Main Verification Card */}
      <div className="mt-6 bg-white rounded-xl border p-6 shadow-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">Verify Business Owner</h1>
          <p className="text-sm text-gray-500 mt-1">Organization: <span className="font-semibold text-gray-700">{state.organizationName}</span></p>
          {client?.businessOwner && (
            <p className="text-xs text-gray-400 mt-0.5">Email: <span className="font-mono">{client.businessOwner}</span></p>
          )}
        </div>

        {/* Expiry & Attempts Info */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase font-medium">Expires</p>
            <p className={`text-xs font-semibold mt-0.5 ${isExpired ? 'text-red-600' : 'text-gray-800'}`}>
              {isExpired ? '⚠ EXPIRED' : expiryDisplay}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase font-medium">Attempts</p>
            <p className="text-xs font-semibold mt-0.5 text-gray-800">{attempts} / 5 used</p>
          </div>
        </div>

        {/* OTP Input */}
        <div>
          <p className="text-xs text-gray-600 text-center mb-4">Enter the 6-digit OTP from the verification email:</p>
          <div className="flex justify-center gap-2">
            {otp.map((digit, i) => (
              <input key={i} id={`otp-${i}`} type="text" inputMode="numeric" maxLength={1} value={digit}
                onChange={e => handleInput(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                disabled={locked}
                aria-label={`OTP digit ${i + 1}`}
                className={`w-11 h-13 text-center text-lg font-bold border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition ${error ? 'border-red-400 bg-red-50' : 'border-gray-200'} ${locked ? 'bg-gray-100 cursor-not-allowed opacity-50' : ''}`}
              />
            ))}
          </div>

          {/* Error / Success Messages */}
          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
          {resent && (
            <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-center">
              <p className="text-xs text-green-700">✓ New OTP sent. Previous OTP is now invalid. Check your email.</p>
            </div>
          )}

          {/* Verify Button */}
          <button onClick={verifyOtp} disabled={locked || otp.join('').length !== 6}
            className="w-full mt-5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-lg transition">
            {locked ? '🔒 Verification Locked' : 'Verify OTP'}
          </button>

          {/* Actions */}
          <div className="flex items-center justify-between mt-4">
            <button onClick={resendOtp} disabled={locked} className="text-xs text-purple-600 hover:text-purple-800 font-medium disabled:text-gray-400 disabled:cursor-not-allowed">
              📧 Resend OTP
            </button>
            <button onClick={() => router.push('/clients')} className="text-xs text-gray-500 hover:text-gray-700">
              ← Back to Clients
            </button>
          </div>
        </div>

        {/* Demo hint */}
        <div className="mt-5 pt-4 border-t text-[10px] text-gray-400 text-center">
          <p>For demo: use OTP <span className="font-mono font-bold">123456</span> | Check Mailpit at <a href="http://localhost:8025" target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-500">localhost:8025</a></p>
        </div>
      </div>

      {/* Onboarding Confirmation Details (collapsible) */}
      {client && (
        <div className="mt-4 bg-white rounded-xl border shadow-sm overflow-hidden">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">📋</span>
              <p className="text-sm font-semibold text-gray-800">Onboarding Confirmation</p>
            </div>
            <span className="text-gray-400 text-xs">{showDetails ? '▲ Hide' : '▼ Show'}</span>
          </button>

          {showDetails && (
            <div className="px-5 pb-5 space-y-4 border-t pt-4">
              {/* Company */}
              <Section title="Company Information">
                <InfoRow label="Organization" value={client.name} />
                <InfoRow label="Industry" value={client.industry} />
                <InfoRow label="Country" value={client.country} />
                <InfoRow label="Timezone" value={client.timezone} />
                <InfoRow label="Business Size" value={client.size} />
                <InfoRow label="Support Model" value={client.supportModel} />
                <InfoRow label="Criticality" value={client.criticality} />
              </Section>

              {/* Business */}
              <Section title="Business Information">
                <InfoRow label="Business Owner" value={client.businessOwner} />
                {(client.departments?.length ?? 0) > 0 && <InfoRow label="Departments" value={client.departments!.join(', ')} />}
                {(client.capabilities?.length ?? 0) > 0 && <InfoRow label="Capabilities" value={client.capabilities!.join(', ')} />}
                {(client.processes?.length ?? 0) > 0 && <InfoRow label="Processes" value={client.processes!.join(', ')} />}
              </Section>

              {/* Technology */}
              {client.techStack && (
                <Section title="Technology Stack">
                  {(client.techStack.apps?.length ?? 0) > 0 && <InfoRow label="Applications" value={client.techStack.apps!.join(', ')} />}
                  {(client.techStack.services?.length ?? 0) > 0 && <InfoRow label="Services" value={client.techStack.services!.join(', ')} />}
                  {(client.techStack.apis?.length ?? 0) > 0 && <InfoRow label="APIs" value={client.techStack.apis!.join(', ')} />}
                  {(client.techStack.databases?.length ?? 0) > 0 && <InfoRow label="Databases" value={client.techStack.databases!.join(', ')} />}
                  {(client.techStack.servers?.length ?? 0) > 0 && <InfoRow label="Servers" value={client.techStack.servers!.join(', ')} />}
                  {(client.techStack.cloud?.length ?? 0) > 0 && <InfoRow label="Cloud" value={client.techStack.cloud!.join(', ')} />}
                  {(client.techStack.infrastructure?.length ?? 0) > 0 && <InfoRow label="Infrastructure" value={client.techStack.infrastructure!.join(', ')} />}
                </Section>
              )}

              {/* Environments */}
              {activeEnvs.length > 0 && (
                <Section title="Environments">
                  <div className="flex flex-wrap gap-1.5">
                    {activeEnvs.map(env => (
                      <span key={env} className="text-[10px] font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded">{env}</span>
                    ))}
                  </div>
                </Section>
              )}

              {/* Monitoring */}
              {activeMonitoring.length > 0 && (
                <Section title="Monitoring">
                  <div className="flex flex-wrap gap-1.5">
                    {activeMonitoring.map(m => (
                      <span key={m} className="text-[10px] font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{m}</span>
                    ))}
                  </div>
                </Section>
              )}

              {/* Selected Services */}
              {(client.enabledServices?.length ?? 0) > 0 && (
                <Section title="Selected AskABD Services">
                  <div className="flex flex-wrap gap-1.5">
                    {client.enabledServices!.map(svc => (
                      <span key={svc} className="text-[10px] font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{svc}</span>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-gray-500 min-w-[100px] shrink-0">{label}:</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  );
}
