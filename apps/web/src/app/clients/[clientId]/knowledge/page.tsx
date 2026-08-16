import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../lib/mock-clients';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientKnowledgePage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Knowledge" description="Knowledge management for this client." />;

  const articles = [
    { id: 'kb-1', title: 'Architecture Overview', category: 'Architecture', status: 'published', updated: '2026-08-01' },
    { id: 'kb-2', title: 'Deployment Runbook', category: 'Runbooks', status: 'published', updated: '2026-07-28' },
    { id: 'kb-3', title: 'Incident Response Procedure', category: 'Runbooks', status: 'published', updated: '2026-07-25' },
    { id: 'kb-4', title: 'Database Connection Pool Tuning', category: 'Known Issues', status: 'published', updated: '2026-07-20' },
    { id: 'kb-5', title: 'SSL Certificate Renewal Process', category: 'Best Practices', status: 'published', updated: '2026-07-15' },
    { id: 'kb-6', title: 'API Rate Limiting Configuration', category: 'Best Practices', status: 'draft', updated: '2026-08-03' },
    { id: 'kb-7', title: 'Post-Incident Review Template', category: 'Lessons Learned', status: 'published', updated: '2026-07-10' },
    { id: 'kb-8', title: 'Environment Provisioning Guide', category: 'Runbooks', status: 'published', updated: '2026-07-05' },
  ];

  const categories = [...new Set(articles.map(a => a.category))];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg">Knowledge Base</h2>
          <p className="text-xs text-gray-500">{articles.length} articles • Architecture, Runbooks, Known Issues, Best Practices</p>
        </div>
        <span className="text-xs text-gray-400">{articles.filter(a => a.status === 'published').length} published</span>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <span className="text-[10px] font-medium px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700">All ({articles.length})</span>
        {categories.map(cat => (
          <span key={cat} className="text-[10px] font-medium px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600">{cat} ({articles.filter(a => a.category === cat).length})</span>
        ))}
      </div>

      {/* Articles */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="divide-y divide-gray-100">
          {articles.map(article => (
            <div key={article.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${article.status === 'published' ? 'bg-green-500' : 'bg-orange-500'}`} />
                <div>
                  <p className="text-sm font-medium text-gray-900">{article.title}</p>
                  <p className="text-[10px] text-gray-400">{article.category} • Updated {article.updated}</p>
                </div>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${article.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{article.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Linked Entities */}
      <section className="bg-white rounded-xl border p-5 mt-6">
        <h3 className="font-semibold text-sm mb-3">Linked Operational Data</h3>
        <div className="grid md:grid-cols-3 gap-3 text-xs">
          <Link href={`/clients/${clientId}/incidents`} className="border rounded-lg p-3 hover:border-purple-200 transition">
            <p className="font-medium">Incidents</p><p className="text-gray-400">{client.incidents.length} linked incidents</p>
          </Link>
          <Link href={`/clients/${clientId}/deployments`} className="border rounded-lg p-3 hover:border-purple-200 transition">
            <p className="font-medium">Deployments</p><p className="text-gray-400">{client.deployments.length} deployment records</p>
          </Link>
          <Link href={`/clients/${clientId}/audit`} className="border rounded-lg p-3 hover:border-purple-200 transition">
            <p className="font-medium">Audit Trail</p><p className="text-gray-400">{client.auditLog.length} audit entries</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
