'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ServiceControlsInline } from './service-controls';
import { getLifecycleState, statusMeta } from '../lib/onboarding-lifecycle';

interface OnboardedClient {
  id: string;
  name: string;
  logo: string;
  industry: string;
  country: string;
  timezone: string;
  size: string;
  supportModel: string;
  criticality: string;
  businessOwner: string;
  health: string;
  slaStatus: string;
  platformScore: number;
  primaryContact: string;
  onboardedAt: string;
  applications: string[];
  enabledServices: string[];
}

export function OnboardedClientsRows() {
  const [clients, setClients] = useState<OnboardedClient[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('askabd-onboarded-clients');
    if (stored) {
      try { const arr = JSON.parse(stored); setClients(Array.isArray(arr) ? arr : []); } catch { /* ignore */ }
    }
  }, []);

  if (clients.length === 0) return null;

  return (
    <>
      {clients.map(c => (
        <tr key={c.id} className="hover:bg-purple-50/30 transition bg-purple-50/10">
          <td className="px-5 py-3">
            <Link href={`/clients/${c.id}`} className="flex items-center gap-3 hover:text-purple-700">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-md flex items-center justify-center shrink-0">
                <span className="text-white text-[10px] font-bold">{c.logo}</span>
              </div>
              <div>
                <p className="font-medium text-gray-900 text-xs">{c.name}</p>
                <p className="text-[10px] text-gray-400">{c.industry}</p>
              </div>
            </Link>
          </td>
          <td className="px-3 py-3"><LifecycleBadge clientId={c.id} /></td>
          <td className="px-3 py-3"><span className="flex items-center gap-1.5 text-xs"><span className="w-2 h-2 rounded-full bg-green-400" />healthy</span></td>
          <td className="px-3 py-3"><span className="text-[10px] font-medium text-green-600">compliant</span></td>
          <td className="px-3 py-3 text-center"><span className="text-xs font-bold">{c.platformScore}</span></td>
          <td className="px-3 py-3 text-center text-xs">{c.applications?.length || 0}</td>
          <td className="px-3 py-3 text-center text-xs">{c.enabledServices?.length || 0}</td>
          <td className="px-3 py-3 text-center"><span className="text-gray-400">0</span></td>
          <td className="px-3 py-3 text-[10px] text-gray-500 max-w-[120px] truncate">{c.primaryContact}</td>
          <td className="px-3 py-3">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400" title="development" />
              <span className="w-2 h-2 rounded-full bg-green-400" title="staging" />
              <span className="w-2 h-2 rounded-full bg-green-400" title="production" />
            </div>
          </td>
          <td className="px-3 py-3">
            <ServiceControlsInline entityId={c.id} entityName={c.name} entityType="client" initialEnabled={true} />
          </td>
        </tr>
      ))}
    </>
  );
}

export function OnboardedClientsCards() {
  const [clients, setClients] = useState<OnboardedClient[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('askabd-onboarded-clients');
    if (stored) {
      try { const arr = JSON.parse(stored); setClients(Array.isArray(arr) ? arr : []); } catch { /* ignore */ }
    }
  }, []);

  if (clients.length === 0) return null;

  return (
    <>
      {clients.map(c => (
        <Link key={c.id} href={`/clients/${c.id}`} className="border border-purple-200 bg-purple-50/30 rounded-xl p-4 hover:shadow-lg hover:border-purple-300 hover:-translate-y-0.5 transition-all duration-200 group">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{c.logo}</span>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-900 group-hover:text-purple-700 transition truncate">{c.name}</p>
              <p className="text-[10px] text-gray-400">{c.industry} • {c.country}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <span className="text-xs text-gray-600">healthy</span>
            <span className="text-[10px] font-medium ml-auto"><LifecycleBadge clientId={c.id} /></span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center border-t pt-3">
            <div><p className="text-sm font-bold text-gray-900">{c.platformScore}</p><p className="text-[9px] text-gray-400 uppercase">Score</p></div>
            <div><p className="text-sm font-bold text-gray-900">0</p><p className="text-[9px] text-gray-400 uppercase">Incidents</p></div>
            <div><p className="text-sm font-bold text-gray-900">{c.applications?.length || 0}</p><p className="text-[9px] text-gray-400 uppercase">Apps</p></div>
          </div>
        </Link>
      ))}
    </>
  );
}

export function OnboardSuccessBanner() {
  const [show, setShow] = useState(false);
  const [verifyUrl, setVerifyUrl] = useState('/verify');

  useEffect(() => {
    if (window.location.search.includes('onboarded=true')) {
      setShow(true);
      // Find the most recent onboarded client for the verify link
      try {
        const clients = JSON.parse(localStorage.getItem('askabd-onboarded-clients') || '[]');
        if (Array.isArray(clients) && clients.length > 0) {
          const latest = clients[clients.length - 1];
          if (latest?.id) setVerifyUrl(`/verify?clientId=${encodeURIComponent(latest.id)}`);
        }
      } catch { /* fallback to /verify */ }
      setTimeout(() => setShow(false), 8000);
      // Clean URL
      window.history.replaceState({}, '', '/clients');
    }
  }, []);

  if (!show) return null;

  return (
    <div className="mb-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-3 animate-in">
      <span className="text-lg">🎉</span>
      <div>
        <p className="text-sm font-semibold text-green-800">Organization Created Successfully!</p>
        <p className="text-[10px] text-green-600">A verification email has been sent. <a href={verifyUrl} className="underline font-medium">Complete verification →</a></p>
      </div>
      <button onClick={() => setShow(false)} className="ml-auto text-green-600 hover:text-green-800 text-sm">✕</button>
    </div>
  );
}

function LifecycleBadge({ clientId }: { clientId: string }) {
  const [label, setLabel] = useState('OTP Sent');
  const [color, setColor] = useState('bg-yellow-100 text-yellow-700');

  useEffect(() => {
    const state = getLifecycleState(clientId);
    if (state) {
      const meta = statusMeta[state.status];
      if (meta) {
        setLabel(meta.label);
        setColor(meta.color);
      }
    }
  }, [clientId]);

  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${color}`}>{label}</span>;
}
