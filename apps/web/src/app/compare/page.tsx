import { apiSafe } from '../lib/api';

interface Item { id: string; name: string; slug: string; brand?: string; priceCurrent?: number; priceCurrency?: string; rating?: number; reviewCount?: number; specifications?: Record<string, unknown>; pros?: string[]; cons?: string[]; availability?: string; }
interface Template { id: string; name: string; attributes?: { name: string; slug: string; dataType: string; unit?: string }[]; }

async function getComparison(itemIds: string[], categoryId?: string) {
  if (itemIds.length < 2) return { items: [] as Item[], template: null as Template | null };
  return apiSafe<{ items: Item[]; template: Template | null }>('/api/v1/compare', { items: [], template: null }, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemIds, categoryId: categoryId || undefined }),
  });
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ items?: string; category?: string }> }) {
  const params = await searchParams;
  const itemIds = params.items?.split(',').filter(Boolean) ?? [];
  const { items, template } = await getComparison(itemIds, params.category);
  const attrs = template?.attributes ?? [];

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Compare Products</h1>
          {template && <p className="text-sm text-gray-500 mt-1">Template: {template.name}</p>}
        </div>
      </div>

      {items.length < 2 ? (
        <div className="bg-white rounded-xl p-12 text-center border">
          <p className="text-xl text-gray-600 mb-4">Select 2 or more items to compare</p>
          <p className="text-gray-400 mb-6">Add item IDs as comma-separated query param: <code className="bg-gray-100 px-2 py-1 rounded">?items=id1,id2</code></p>
          <a href="/categories" className="gradient-brand text-white px-6 py-3 rounded-lg inline-block">Browse Categories</a>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white rounded-xl overflow-hidden shadow-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-4 bg-gray-50 sticky left-0 z-10 min-w-[180px] font-medium text-gray-600">Attribute</th>
                {items.map(item => (
                  <th key={item.id} className="p-4 min-w-[220px] text-center border-l">
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-500">{item.brand || '—'}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <CompareRow label="Price" items={items} render={i => i.priceCurrent ? `${i.priceCurrency || 'USD'} ${i.priceCurrent}` : '—'} />
              <CompareRow label="Rating" items={items} render={i => i.rating ? `★ ${i.rating.toFixed(1)} (${i.reviewCount || 0})` : '—'} />
              <CompareRow label="Availability" items={items} render={i => i.availability || '—'} />
              {attrs.map(attr => (
                <CompareRow key={attr.slug} label={`${attr.name}${attr.unit ? ` (${attr.unit})` : ''}`} items={items} render={i => String((i.specifications as any)?.[attr.slug] ?? '—')} />
              ))}
              <CompareRow label="Pros" items={items} render={i => i.pros?.join(', ') || '—'} className="text-green-700" />
              <CompareRow label="Cons" items={items} render={i => i.cons?.join(', ') || '—'} className="text-red-600" />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CompareRow({ label, items, render, className }: { label: string; items: Item[]; render: (i: Item) => string; className?: string }) {
  return (
    <tr className="border-b hover:bg-blue-50/30">
      <td className="p-4 font-medium text-gray-700 bg-gray-50 sticky left-0">{label}</td>
      {items.map(item => <td key={item.id} className={`p-4 text-center border-l text-sm ${className || ''}`}>{render(item)}</td>)}
    </tr>
  );
}
