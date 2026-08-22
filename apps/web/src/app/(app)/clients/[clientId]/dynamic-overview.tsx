'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ClientCommandCenter } from '../../../components/client-command-center';
import { getClient } from '../../../lib/operations-api';

/**
 * Dynamic client overview — used for clients onboarded via the wizard
 * that aren't in the mock data.
 *
 * Found during the staff-workflow UAT: this previously read the client's header info
 * (name/industry/country/size) EXCLUSIVELY from localStorage. Since localStorage is
 * per-browser and per-device, a real client created via the wizard (real oc_clients
 * row, real ID) rendered as an essentially empty header — just the raw ID — for any
 * staff member other than the one who ran the wizard, in any other browser, or after
 * clearing site data. The real record was always one API call away
 * (`GET /oc/clients/:id`, already used elsewhere in the app) but nothing here called
 * it. Now the real API is the primary source; localStorage is only consulted if the
 * API call fails, matching the graceful-degradation pattern used by the onboarding
 * wizard itself.
 */
export function DynamicClientOverview() {
  const params = useParams();
  const clientId = params.clientId as string;
  const [client, setClient] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    function loadFromLocalStorage() {
      try {
        const clients = JSON.parse(localStorage.getItem('askabd-onboarded-clients') || '[]');
        const match = Array.isArray(clients) ? clients.find((c: any) => c.id === clientId) : null;
        if (match && !cancelled) setClient(match);
      } catch { /* skip */ }
    }

    getClient(clientId)
      .then(res => {
        if (cancelled) return;
        if (!res?.client) { loadFromLocalStorage(); return; }
        const c = res.client;
        // Normalize the real oc_clients row's field names to what this component
        // (and ClientCommandCenter below it) already expects from the wizard's
        // localStorage shape — additive, not a schema change.
        setClient({
          id: c.id, name: c.name, logo: c.logo, industry: c.industry,
          country: c.country, size: c.business_size || c.businessSize,
        });
      })
      .catch(loadFromLocalStorage);

    return () => { cancelled = true; };
  }, [clientId]);

  const name = client?.name || clientId;

  return (
    <div className="space-y-6">
      {/* Client Header for dynamic clients */}
      {client && (
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-lg">{client.logo || name.substring(0, 2).toUpperCase()}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{name}</h1>
            <p className="text-sm text-gray-500">{client.industry} • {client.country} • {client.size}</p>
          </div>
        </div>
      )}

      <ClientCommandCenter clientId={clientId} clientName={name} />
    </div>
  );
}
