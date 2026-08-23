'use client';
import { useState, useEffect } from 'react';
import { Action } from './button';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

type Classification = 'public' | 'internal' | 'confidential' | 'restricted' | 'secret';
type VpnStatus = 'not_required' | 'required' | 'configured' | 'connected' | 'failed' | 'expired' | 'auth_failed';
type PermissionScope = 'read_only' | 'read_write' | 'admin';
type NetworkPath = 'direct_https' | 'private_https' | 'vpn' | 'site_to_site_vpn' | 'wireguard' | 'ipsec' | 'private_network' | 'vpc_peering' | 'private_link' | 'bastion' | 'ssh_tunnel' | 'reverse_connector' | 'agent' | 'other';

interface SecurityProfile {
  dataClassification: Classification; vpnStatus: VpnStatus; permissionScope: PermissionScope;
  networkPath: NetworkPath; dataResidencyRegion: string | null; lastReviewedAt: string | null; reviewedBy: string | null;
}

const CLASS_META: Record<Classification, string> = {
  public: 'text-gray-500 bg-gray-50 border-gray-200', internal: 'text-blue-700 bg-blue-50 border-blue-200',
  confidential: 'text-amber-700 bg-amber-50 border-amber-200', restricted: 'text-orange-700 bg-orange-50 border-orange-200',
  secret: 'text-red-700 bg-red-50 border-red-200',
};
const VPN_META: Record<VpnStatus, string> = {
  not_required: 'text-gray-500 bg-gray-50 border-gray-200', required: 'text-orange-700 bg-orange-50 border-orange-200',
  configured: 'text-blue-700 bg-blue-50 border-blue-200', connected: 'text-green-700 bg-green-50 border-green-200',
  failed: 'text-red-700 bg-red-50 border-red-200', expired: 'text-red-700 bg-red-50 border-red-200',
  auth_failed: 'text-red-700 bg-red-50 border-red-200',
};
const NETWORK_LABEL: Record<NetworkPath, string> = {
  direct_https: 'Direct HTTPS', private_https: 'Private HTTPS', vpn: 'VPN', site_to_site_vpn: 'Site-to-Site VPN',
  wireguard: 'WireGuard', ipsec: 'IPSec', private_network: 'Private Network', vpc_peering: 'VPC Peering',
  private_link: 'Private Link', bastion: 'Bastion / Jump Host', ssh_tunnel: 'SSH Tunnel',
  reverse_connector: 'Reverse Secure Connector', agent: 'Agent-Based Connector', other: 'Other',
};

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded border ${className}`}>{children}</span>;
}

export function ConnectionSecurityPanel({ clientId, sourceType, sourceId }: { clientId: string; sourceType: string; sourceId: string }) {
  const [profile, setProfile] = useState<SecurityProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<SecurityProfile>>({});

  useEffect(() => {
    fetch(`${API}/api/v1/oc/clients/${clientId}/connection-security/${sourceType}/${sourceId}`)
      .then(r => r.ok ? r.json() : null)
      .then(p => { if (p) { setProfile(p); setForm(p); } });
  }, [clientId, sourceType, sourceId]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/connection-security/${sourceType}/${sourceId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (res.ok) { setProfile(await res.json()); setEditing(false); }
    } finally { setSaving(false); }
  }

  if (!profile) return <p className="text-[10px] text-gray-400">Loading security profile…</p>;

  return (
    <div className="border-t border-gray-200 pt-3 mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Security Profile</p>
        <button onClick={() => setEditing(e => !e)} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">{editing ? 'Cancel' : 'Edit'}</button>
      </div>
      {!editing ? (
        <div className="flex flex-wrap gap-1.5">
          <Badge className={CLASS_META[profile.dataClassification]}>Data: {profile.dataClassification}</Badge>
          <Badge className={VPN_META[profile.vpnStatus]}>VPN: {profile.vpnStatus.replace('_', ' ')}</Badge>
          <Badge className="text-gray-600 bg-gray-50 border-gray-200">Access: {profile.permissionScope.replace('_', ' ')}</Badge>
          <Badge className="text-gray-600 bg-gray-50 border-gray-200">{NETWORK_LABEL[profile.networkPath]}</Badge>
          {profile.vpnStatus === 'required' && (
            <p className="w-full text-[9px] text-red-600 mt-1">BLOCKED — VPN CONNECTION REQUIRED. Real connections (comparisons, tests) against this connector will be refused until VPN status is set to Connected.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <select value={form.dataClassification} onChange={e => setForm(f => ({ ...f, dataClassification: e.target.value as Classification }))} className="border rounded px-2 py-1 text-[10px]">
            {Object.keys(CLASS_META).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={form.vpnStatus} onChange={e => setForm(f => ({ ...f, vpnStatus: e.target.value as VpnStatus }))} className="border rounded px-2 py-1 text-[10px]">
            {Object.keys(VPN_META).map(v => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}
          </select>
          <select value={form.permissionScope} onChange={e => setForm(f => ({ ...f, permissionScope: e.target.value as PermissionScope }))} className="border rounded px-2 py-1 text-[10px]">
            <option value="read_only">Read Only</option><option value="read_write">Read/Write</option><option value="admin">Admin</option>
          </select>
          <select value={form.networkPath} onChange={e => setForm(f => ({ ...f, networkPath: e.target.value as NetworkPath }))} className="border rounded px-2 py-1 text-[10px]">
            {Object.entries(NETWORK_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="col-span-2">
            <Action variant="primary" onClick={save} loading={saving} className="!text-[10px] !px-3 !py-1.5">Save</Action>
          </div>
        </div>
      )}
      {profile.reviewedBy && <p className="text-[8px] text-gray-400 mt-1.5">Last reviewed by {profile.reviewedBy} · {profile.lastReviewedAt ? new Date(profile.lastReviewedAt).toLocaleString('en-AU') : ''}</p>}
    </div>
  );
}
