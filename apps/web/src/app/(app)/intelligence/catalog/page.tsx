import Link from 'next/link';
import { serviceCatalog } from '../../../lib/service-catalog';
import { Breadcrumb } from '../../../components/breadcrumb';

export default function ServiceCatalogPage() {
  const categories = ['assessment', 'operations', 'transformation', 'governance', 'support'] as const;
  const categoryLabels: Record<string, string> = { assessment: 'Assessment & Analysis', operations: 'Operations & Monitoring', transformation: 'Transformation & Modernization', governance: 'Governance & Compliance', support: 'Support & Knowledge' };

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Intelligence', href: '/intelligence' }, { label: 'Service Catalog' }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-1">AskABD Service Catalog</h1>
      <p className="text-sm text-gray-500 mb-6">{serviceCatalog.length} enterprise services available for client enablement</p>

      {categories.map(cat => {
        const services = serviceCatalog.filter(s => s.category === cat);
        return (
          <section key={cat} className="mb-8">
            <h2 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">{categoryLabels[cat]} ({services.length})</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map(svc => (
                <Link key={svc.id} href={`/intelligence/catalog/${svc.id}`} className="bg-white rounded-xl border p-5 hover:shadow-md hover:border-purple-200 transition group">
                  <h3 className="font-semibold text-sm mb-1 group-hover:text-purple-700">{svc.name}</h3>
                  <p className="text-[11px] text-gray-500 mb-3">{svc.description}</p>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-400">{svc.expectedTimeline}</span>
                    <span className="text-purple-600 font-medium">{svc.deliverables.length} deliverables</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
