import Link from 'next/link';

interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  itemCount?: number;
}

async function getCategories(): Promise<{ categories: CategorySummary[]; error?: string }> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

  try {
    const response = await fetch(`${apiUrl}/api/v1/categories`, { cache: 'no-store' });
    if (!response.ok) {
      return { categories: [], error: 'We could not load categories right now.' };
    }

    const payload = await response.json() as { categories?: CategorySummary[] };
    return { categories: payload.categories ?? [] };
  } catch {
    return { categories: [], error: 'We could not load categories right now.' };
  }
}

export default async function CategoriesPage() {
  const { categories, error } = await getCategories();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <div className="mb-8 flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-purple-600">Browse categories</p>
        <h1 className="text-3xl font-bold text-gray-900">All Categories</h1>
        <p className="text-gray-600">Explore products and services organized by category.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          <h2 className="font-semibold">We hit a snag loading categories</h2>
          <p className="mt-2 text-sm">{error}</p>
        </div>
      ) : null}

      {!error && categories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">
          <h2 className="text-lg font-semibold text-gray-900">No categories available</h2>
          <p className="mt-2">Categories will appear here once they are published in the catalog.</p>
        </div>
      ) : null}

      {!error && categories.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((cat) => (
            <Link key={cat.slug} href={`/categories/${cat.slug}`} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-50 text-2xl">
                  {cat.icon || '📦'}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{cat.name}</h3>
                  <p className="mt-1 text-sm text-gray-500">{(cat.itemCount ?? 0).toLocaleString()} items to compare</p>
                </div>
              </div>
              {cat.description ? <p className="mt-4 text-sm text-gray-600">{cat.description}</p> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
