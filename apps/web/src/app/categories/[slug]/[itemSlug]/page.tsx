import Link from 'next/link';
import { notFound } from 'next/navigation';

interface CategoryDetail {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  itemCount?: number;
}

interface CategoryItemsPayload {
  category?: CategoryDetail;
  items?: Array<{
    id: string;
    name: string;
    slug: string;
    description?: string;
    priceCurrent?: number;
    priceOriginal?: number;
    priceCurrency?: string;
    rating?: number;
    reviewCount?: number;
    merchant?: string;
    availability?: string;
  }>;
}

async function getCategoryData(slug: string): Promise<CategoryItemsPayload> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

  try {
    const categoryResponse = await fetch(`${apiUrl}/api/v1/categories/${slug}`, { cache: 'no-store' });
    if (!categoryResponse.ok) {
      if (categoryResponse.status === 404) {
        notFound();
      }
      return { category: undefined, items: [] };
    }

    const category = await categoryResponse.json() as CategoryDetail;
    const itemsResponse = await fetch(`${apiUrl}/api/v1/items?categoryId=${category.id}`, { cache: 'no-store' });
    const itemsPayload = itemsResponse.ok ? await itemsResponse.json() as { items?: CategoryItemsPayload['items'] } : { items: [] };

    return { category, items: itemsPayload.items ?? [] };
  } catch {
    return { category: undefined, items: [] };
  }
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const data = await getCategoryData(resolvedParams.slug);
  const category = data.category;
  const items = data.items ?? [];

  if (!category) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <nav className="mb-6 text-sm text-gray-500">
        <Link href="/categories" className="hover:text-purple-600">Categories</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700">{category.name}</span>
      </nav>

      <header className="mb-8 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-purple-50 text-3xl">
              {category.icon || '📦'}
            </div>
            <h1 className="text-3xl font-bold text-gray-900">{category.name}</h1>
            <p className="mt-2 max-w-2xl text-gray-600">{category.description || 'Explore the best options in this category and compare items side by side.'}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-5 py-4 text-sm text-gray-600">
            <p className="font-semibold text-gray-900">{(category.itemCount ?? items.length).toLocaleString()} items available</p>
            <p>Browse curated products and services for this category.</p>
          </div>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">
          <h2 className="text-lg font-semibold text-gray-900">No items published yet</h2>
          <p className="mt-2">This category is live, but there are no products available at the moment.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Link key={item.slug} href={`/categories/${category.slug}/${item.slug}`} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{item.name}</h2>
                  <p className="mt-1 text-sm text-gray-500">{item.merchant || 'Verified merchant'}</p>
                </div>
                <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {item.availability || 'Available'}
                </div>
              </div>
              {item.description ? <p className="mb-4 text-sm text-gray-600">{item.description}</p> : null}
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold text-gray-900">{item.priceCurrent ? `${item.priceCurrency || 'USD'} ${item.priceCurrent.toLocaleString()}` : 'Price not listed'}</p>
                  {item.rating ? <p className="text-gray-500">⭐ {item.rating.toFixed(1)} ({item.reviewCount ?? 0} reviews)</p> : null}
                </div>
                <span className="text-purple-600">View details →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
