import { notFound } from 'next/navigation';
import Link from 'next/link';
import { serviceCatalog } from '../../../lib/service-catalog';
import { Breadcrumb } from '../../../components/breadcrumb';

interface Props { params: Promise<{ serviceId: string }> }

export default async function CatalogServiceDetailPage({ params }: Props) {
  const { serviceId } = await params;
  const svc = serviceCatalog.find(s => s.id === serviceId);
  if (!svc) notFound();
  const deps = serviceCatalog.filter(s => svc.dependencies.includes(s.id));

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Intelligence', href: '/intelligence' }, { label: 'Catalog', href: '/intelligence/catalog' }, { label: svc.name }]} />
      <h1 className="text-xl font-bold mb-1">{svc.name}</h1>
      <p className="text-sm text-gray-500 mb-6">{svc.description}</p>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Business Value</h2>
            <p className="text-sm text-gray-700">{svc.businessValue}</p>
          </section>
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Deliverables</h2>
            <ul className="space-y-1.5">{svc.deliverables.map((d, i) => <li key={i} className="flex items-center gap-2 text-sm"><span className="w-1.5 h-1.5 rounded-full bg-purple-500" />{d}</li>)}</ul>
          </section>
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Required Information</h2>
            <ul className="space-y-1.5">{svc.requiredInformation.map((r, i) => <li key={i} className="flex items-center gap-2 text-sm"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" />{r}</li>)}</ul>
            <p className="text-xs text-gray-400 mt-3 border-t pt-3">If required information is unavailable, AskABD will generate a Missing Information Report explaining what cannot be assessed and why.</p>
          </section>
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Outputs</h2>
            <ul className="space-y-1.5">{svc.outputs.map((o, i) => <li key={i} className="flex items-center gap-2 text-sm"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />{o}</li>)}</ul>
          </section>
        </div>
        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Service Info</h3>
            <div className="space-y-2 text-xs">
              <Row label="Category" value={svc.category} />
              <Row label="Timeline" value={svc.expectedTimeline} />
              <Row label="Prerequisites" value={svc.prerequisites.length > 0 ? svc.prerequisites.join(', ') : 'None'} />
            </div>
          </section>
          {deps.length > 0 && (
            <section className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Dependencies</h3>
              <div className="space-y-1.5">{deps.map(d => <Link key={d.id} href={`/intelligence/catalog/${d.id}`} className="block text-xs text-purple-600 hover:text-purple-800 py-1">{d.name}</Link>)}</div>
            </section>
          )}
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Quick Links</h3>
            <div className="space-y-1.5">
              <Link href="/intelligence/catalog" className="block text-xs text-gray-600 hover:text-purple-600 py-1">← All Services</Link>
              <Link href="/clients" className="block text-xs text-gray-600 hover:text-purple-600 py-1">Enable for Client</Link>
              <Link href="/intelligence" className="block text-xs text-gray-600 hover:text-purple-600 py-1">Intelligence Hub</Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-medium text-gray-800 capitalize">{value}</span></div>; }
