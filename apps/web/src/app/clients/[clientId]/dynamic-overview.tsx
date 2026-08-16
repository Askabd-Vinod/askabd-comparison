'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ClientCommandCenter } from '../../components/client-command-center';

/**
 * Dynamic client overview — used for clients onboarded via the wizard
 * that aren't in the mock data. Loads client info from localStorage.
 */
export function DynamicClientOverview() {
  const params = useParams();
  const clientId = params.clientId as string;
  const [client, setClient] = useState<any>(null);

  useEffect(() => {
    try {
      const clients = JSON.parse(localStorage.getItem('askabd-onboarded-clients') || '[]');
      const match = Array.isArray(clients) ? clients.find((c: any) => c.id === clientId) : null;
      if (match) setClient(match);
    } catch { /* skip */ }
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
