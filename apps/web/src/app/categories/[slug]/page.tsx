import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiSafe } from '../../lib/api';

interface Category { id: string; name: string; slug: string; description?: string; icon?: string; itemCount?: number; }
interface Item { id: string; name: string; slug: string; description?: string; priceCurrent?: number; priceOriginal?: number; priceCurrency?: string; rating?: number; reviewCount?: number; merchant?: string; availability?: string; }

export default async function CategoryDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  
  let category: Category | null = null;
  try {
    const { api } = await import('../../lib/api');
    category = await api<Category>(`/api/v1/categories/${slug}`);
  } catch { notFound(); }
  if (!category) notFound();

  const { items } = await apiSafe<{ items: Item[] }>(`/api/v1/items?categoryId=${category.id}`, { items: [] });

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <nav className="mb-6 text-sm text-gray-500">
        <Link href="/categories" className="hover:text-purple-600">Categories</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700">{category.name}</span>
      </nav>

      <header className="mb-8 rounded-2xl border bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-purple-50 text-3xl">{category.icon || '📦'}</div>
            <h1 className="text-3xl font-bold">{category.name}</h1>
            <p className="mt-2 text-gray-600 max-w-2xl">{category.description || 'Explore the best options in this category and compare items side by side.'}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-5 py-4 text-sm">
            <p className="font-semibold">{(category.itemCount ?? items.length)} items</p>
          </div>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-gray-600 bg-white">
          <h2 className="text-lg font-semibold">No items published yet</h2>
          <p className="mt-2">This category is live, but no products are available yet.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {items.map(item => (
            <div key={item.id} className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-lg font-semibold">{item.name}</h2>
                  <p className="text-sm text-gray-500">{item.merchant || 'Verified merchant'}</p>
                </div>
                <span className="bg-green-50 text-green-700 text-xs px-2 py-1 rounded-full font-medium">{item.availability || 'Available'}</span>
              </div>
              {item.description && <p className="text-sm text-gray-600 mb-4">{item.description}</p>}
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold">{item.priceCurrent ? `${item.priceCurrency || 'USD'} ${item.priceCurrent}` : 'Price not listed'}</p>
                  {item.rating ? <p className="text-gray-500">⭐ {item.rating.toFixed(1)} ({item.reviewCount || 0})</p> : null}
                </div>
                <a href={`/compare?items=${item.id}`} className="text-purple-600 text-xs font-medium">+ Compare</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
