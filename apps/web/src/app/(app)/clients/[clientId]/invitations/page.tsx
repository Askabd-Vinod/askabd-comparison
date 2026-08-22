'use client';
import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { ErrorState } from '../../../../components/error-state';
import { staffFetch } from '../../../../lib/staff-session';

/**
 * Client Invitations — admin-facing management for the real invitation system
 * (services/invitation-service.ts, migration 025/032).
 *
 * Every status shown here is the real row from oc_invitations — never fabricated.
 * Create/renew/copy-link/revoke call the real, Admin.Access-gated API routes; the
 * invitee's raw invitation token is never displayed except for the few seconds right
 * after Create/Renew/Copy Link — the ONE moment it genuinely exists in the response —
 * and even then only as a "copied to clipboard" confirmation, never rendered as text.
 *
 * Redesigned 2026-08-20 around the invitation as a PERSISTENT business object: the
 * same email can no longer accumulate duplicate rows (the backend reuses/renews in
 * place — see invitation-service.ts), and the primary actions match the real
 * lifecycle (Review/Copy Link/Renew/Revoke for Pending, View Client for Accepted,
 * Renew for Expired, Create New for Revoked) instead of a generic "Resend."
 */
interface Invitation {
  id: string;
  clientId: string;
  orgContext: string;
  email: string;
  status: 'invited' | 'accepted' | 'expired' | 'revoked';
  effectiveStatus: 'pending' | 'accepted' | 'expired' | 'revoked';
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  resentCount: number;
  lastSentAt: string | null;
}

const STATUS_META: Record<Invitation['effectiveStatus'], { label: string; icon: string; className: string }> = {
  pending: { label: 'Pending', icon: '⏳', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  accepted: { label: 'Accepted', icon: '✓', className: 'text-green-700 bg-green-50 border-green-200' },
  expired: { label: 'Expired', icon: '⚠', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  revoked: { label: 'Revoked', icon: '✕', className: 'text-red-700 bg-red-50 border-red-200' },
};

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[9px] text-gray-500 uppercase">{label}</p></div>;
}

function InvitationRow({ inv, actionInFlight, onRenew, onRevoke, onCreateNew }: {
  inv: Invitation; actionInFlight: string | null;
  onRenew: (id: string, sendEmail: boolean) => void;
  onRevoke: (id: string) => void;
  onCreateNew: (inv: Invitation) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const meta = STATUS_META[inv.effectiveStatus];
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-900">{inv.email}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">{inv.orgContext}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md border ${meta.className}`}>
            <span aria-hidden="true">{meta.icon}</span>{meta.label}
          </span>
          <div className="flex flex-wrap gap-2.5">
            {inv.effectiveStatus === 'pending' && (
              <>
                <button onClick={() => onRenew(inv.id, false)} disabled={actionInFlight === inv.id + 'link'}
                  className="text-[10px] font-medium text-blue-600 hover:text-blue-800 disabled:text-blue-300">
                  {actionInFlight === inv.id + 'link' ? 'Copying…' : 'Copy Link'}
                </button>
                <button onClick={() => onRenew(inv.id, true)} disabled={actionInFlight === inv.id + 'renew'}
                  className="text-[10px] font-medium text-gray-600 hover:text-gray-900 disabled:text-gray-300">
                  {actionInFlight === inv.id + 'renew' ? 'Renewing…' : 'Renew'}
                </button>
                <button onClick={() => onRevoke(inv.id)} disabled={actionInFlight === inv.id + 'revoke'}
                  className="text-[10px] font-medium text-red-600 hover:text-red-800 disabled:text-red-300">
                  {actionInFlight === inv.id + 'revoke' ? 'Revoking…' : 'Revoke'}
                </button>
              </>
            )}
            {inv.effectiveStatus === 'expired' && (
              <button onClick={() => onRenew(inv.id, true)} disabled={actionInFlight === inv.id + 'renew'}
                className="text-[10px] font-medium text-blue-600 hover:text-blue-800 disabled:text-blue-300">
                {actionInFlight === inv.id + 'renew' ? 'Renewing…' : 'Renew Invitation'}
              </button>
            )}
            {inv.effectiveStatus === 'accepted' && (
              <a href={`/clients/${inv.clientId}`} className="text-[10px] font-medium text-gray-600 hover:text-gray-900">View Client</a>
            )}
            {inv.effectiveStatus === 'revoked' && (
              <button onClick={() => onCreateNew(inv)} className="text-[10px] font-medium text-blue-600 hover:text-blue-800">Create New Invitation</button>
            )}
          </div>
          <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">
            {expanded ? 'Close' : 'Details'}
          </button>
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 text-xs">
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><dt className="text-[10px] text-gray-400 uppercase tracking-wide">Created</dt><dd className="text-gray-700 font-medium mt-0.5">{new Date(inv.createdAt).toLocaleString('en-AU')}</dd></div>
            <div><dt className="text-[10px] text-gray-400 uppercase tracking-wide">{inv.effectiveStatus === 'accepted' && inv.acceptedAt ? 'Accepted' : 'Expires'}</dt><dd className="text-gray-700 font-medium mt-0.5">{inv.effectiveStatus === 'accepted' && inv.acceptedAt ? new Date(inv.acceptedAt).toLocaleString('en-AU') : new Date(inv.expiresAt).toLocaleString('en-AU')}</dd></div>
            {inv.invitedBy && <div><dt className="text-[10px] text-gray-400 uppercase tracking-wide">Invited by</dt><dd className="text-gray-700 font-medium mt-0.5">{inv.invitedBy}</dd></div>}
            {inv.lastSentAt && <div><dt className="text-[10px] text-gray-400 uppercase tracking-wide">Last sent</dt><dd className="text-gray-700 font-medium mt-0.5">{new Date(inv.lastSentAt).toLocaleString('en-AU')}</dd></div>}
            <div><dt className="text-[10px] text-gray-400 uppercase tracking-wide">Renewal attempts</dt><dd className="text-gray-700 font-medium mt-0.5">{inv.resentCount}</dd></div>
          </dl>
          <p className="text-[10px] text-gray-400 mt-3">The invitation link itself is never shown here — use Copy Link to generate and copy a fresh one.</p>
        </div>
      )}
    </div>
  );
}

interface PageProps { params: Promise<{ clientId: string }> }

export default function ClientInvitationsPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [orgContext, setOrgContext] = useState('');
  const [orgSuggestions, setOrgSuggestions] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${id}/invitations`);
      if (res.ok) {
        setInvitations((await res.json()).invitations ?? []);
      } else if (res.status === 401 || res.status === 403) {
        setError('You are not authorized to manage invitations for this client.');
      } else {
        setError('Unable to load invitations. The backend may be unavailable.');
      }
    } catch (err) {
      setError(`Unable to reach AskABD API: ${(err as Error).message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    params.then(p => { setClientId(p.clientId); load(p.clientId); });
  }, [params, load]);

  useEffect(() => {
    staffFetch('/api/v1/oc/org-contexts')
      .then(res => res.ok ? res.json() : { orgContexts: [] })
      .then(body => setOrgSuggestions(body.orgContexts ?? []))
      .catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, orgContext }),
      });
      const body = await res.json();
      if (!res.ok) {
        setCreateError(body?.error?.message || 'Could not create invitation.');
        setCreating(false);
        return;
      }
      setEmail('');
      setOrgContext('');
      if (body.reused) {
        showToast(`${email} already has a pending invitation for this client — showing the existing one.`);
      } else if (body.invitation?.acceptUrl) {
        await copyLink(body.invitation.acceptUrl, 'Invitation sent — link also copied to your clipboard.');
      } else {
        showToast('Invitation sent.');
      }
      await load(clientId);
    } catch (err) {
      setCreateError(`Could not reach AskABD API: ${(err as Error).message}`);
    }
    setCreating(false);
  }

  async function copyLink(url: string, message: string) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      showToast(message);
    } catch {
      showToast('Link generated (clipboard copy was blocked by your browser).');
    }
  }

  async function handleRenew(id: string, sendEmail: boolean) {
    const key = id + (sendEmail ? 'renew' : 'link');
    setActionInFlight(key);
    try {
      const res = await staffFetch(`/api/v1/oc/invitations/${id}/${sendEmail ? 'renew' : 'link'}`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        showToast(body?.error?.message || 'Could not complete this action.');
      } else if (sendEmail) {
        showToast('Invitation renewed — a fresh email was sent.');
      } else if (body.invitation?.acceptUrl) {
        await copyLink(body.invitation.acceptUrl, 'Fresh link copied to your clipboard.');
      }
      await load(clientId);
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleRevoke(id: string) {
    setActionInFlight(id + 'revoke');
    try {
      await staffFetch(`/api/v1/oc/invitations/${id}/revoke`, { method: 'POST' });
      showToast('Invitation revoked.');
      await load(clientId);
    } finally {
      setActionInFlight(null);
    }
  }

  if (loading) return <div className="p-6 text-gray-400">Loading invitations...</div>;
  if (error) return (
    <div className="p-6">
      <ErrorState what="Invitations could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={() => load(clientId)} />
    </div>
  );

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Client Invitations</h2>
      <p className="text-xs text-gray-500 mb-6">
        Invite a real customer contact to this client&apos;s workspace. Accepting the invitation creates their real
        AskABD account and grants them access to this client only — nothing else.
      </p>

      {toast && (
        <div role="status" className="mb-4 px-4 py-2.5 bg-gray-900 text-white text-xs rounded-md shadow-lg inline-flex items-center gap-2">
          {toast}
        </div>
      )}

      <form onSubmit={handleCreate} className="bg-white rounded-xl border p-5 mb-6 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label htmlFor="inv-email" className="block text-xs text-gray-500 mb-1">Customer email</label>
          <input id="inv-email" value={email} onChange={e => setEmail(e.target.value)} type="email" required
            className="w-full border rounded-md px-3 py-2 text-sm" placeholder="customer@company.com" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label htmlFor="inv-org" className="block text-xs text-gray-500 mb-1">Customer organization</label>
          <input id="inv-org" value={orgContext} onChange={e => setOrgContext(e.target.value)} type="text" required
            list="known-org-contexts"
            className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Pick a known organization, or type a new one" />
          <datalist id="known-org-contexts">
            {orgSuggestions.map(o => <option key={o} value={o} />)}
          </datalist>
          <p className="text-[10px] text-gray-400 mt-1">
            The customer&apos;s own organization in AskABD Identity — not this AskABD client. Choose a previously-used
            organization from the list, or type a new one for a brand-new customer.
          </p>
        </div>
        <button type="submit" disabled={creating || !email || !orgContext}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold px-4 py-2 rounded-md">
          {creating ? 'Sending…' : 'Send Invitation'}
        </button>
      </form>
      {createError && (
        <div className="mb-6">
          {/* Real bug found during the 2026-08-21 UAT pass: `createError` here is
              ALREADY a safe, human-readable message — either the API's own specific
              business-rule reason ("This person already has access to this client.")
              or a plain network-failure message (see handleCreate above) — never a
              raw stack trace. Passing it as `technicalDetail` hid the actual useful
              reason behind a "Show technical details" toggle, so staff saw only the
              generic "Invitation not sent" with no indication of why. Showing it via
              `why` instead surfaces the real reason immediately, matching every other
              known-business-condition error elsewhere in the app; there is no longer
              anything left to hide behind a technical-details toggle for this case. */}
          <ErrorState what="Invitation not sent" why={createError} />
        </div>
      )}

      {invitations.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="Total" value={invitations.length} />
          <Stat label="Pending" value={invitations.filter(i => i.effectiveStatus === 'pending').length} color="text-blue-600" />
          <Stat label="Accepted" value={invitations.filter(i => i.effectiveStatus === 'accepted').length} color="text-green-600" />
          <Stat label="Expired / Revoked" value={invitations.filter(i => i.effectiveStatus === 'expired' || i.effectiveStatus === 'revoked').length} color="text-orange-600" />
        </div>
      )}

      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-3">Invitations ({invitations.length})</h3>
        {invitations.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-3xl mb-2">📨</div>
            <p className="text-sm font-medium text-gray-700">No invitations sent yet</p>
            <p className="text-xs text-gray-400 mt-1">Invite a customer contact above to give them access to this client&apos;s workspace.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {invitations.map(inv => (
              <InvitationRow
                key={inv.id}
                inv={inv}
                actionInFlight={actionInFlight}
                onRenew={handleRenew}
                onRevoke={handleRevoke}
                onCreateNew={i => { setEmail(i.email); setOrgContext(i.orgContext); }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
