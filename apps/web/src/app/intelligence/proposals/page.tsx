import Link from 'next/link';
import { mockClients } from '../../lib/mock-clients';
import { Breadcrumb } from '../../components/breadcrumb';

export default function ProposalsPage() {
  const clients = mockClients;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Intelligence', href: '/intelligence' }, { label: 'Proposals' }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Proposal Generator</h1>
      <p className="text-sm text-gray-500 mb-6">Auto-generated transformation proposals based on assessments and identified opportunities</p>

      <div className="space-y-4">
        {clients.map(client => {
          const opportunities = client.platformScore < 90 ? Math.ceil((100 - client.platformScore) / 15) : 1;
          return (
            <Link key={client.id} href={`/clients/${client.id}/consulting`} className="block bg-white rounded-xl border p-5 hover:shadow-md hover:border-purple-200 transition">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 gradient-brand rounded-lg flex items-center justify-center"><span className="text-white text-xs font-bold">{client.logo}</span></div>
                  <div>
                    <h3 className="font-semibold text-sm">{client.name}</h3>
                    <p className="text-[11px] text-gray-400">{client.industry}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-purple-600">{opportunities} opportunities</p>
                  <p className="text-[10px] text-gray-400">Maturity: {client.platformScore}%</p>
                </div>
              </div>
              <div className="grid md:grid-cols-4 gap-3 text-xs">
                <div><span className="text-gray-400">Current State: </span><span className="font-medium">{client.platformScore}% maturity</span></div>
                <div><span className="text-gray-400">Target: </span><span className="font-medium">95%+</span></div>
                <div><span className="text-gray-400">Incidents: </span><span className={client.activeIncidents > 0 ? 'text-red-600 font-medium' : ''}>{client.activeIncidents}</span></div>
                <div><span className="text-gray-400">SLA: </span><span className={`font-medium ${client.slaStatus === 'compliant' ? 'text-green-600' : 'text-red-600'}`}>{client.slaStatus}</span></div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
