interface SearchResultItem {
  id: string;
  name: string;
  slug: string;
  brand?: string;
  description?: string;
  priceCurrent?: number;
  priceCurrency?: string;
  rating?: number;
  reviewCount?: number;
  merchant?: string;
  availability?: string;
}

interface SearchResultCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
}

interface SearchResultBrand {
  id: string;
  name: string;
  slug: string;
  description?: string;
  verified?: boolean;
}

interface SearchPayload {
  results?: {
    query?: string;
    items?: SearchResultItem[];
    categories?: SearchResultCategory[];
    brands?: SearchResultBrand[];
  };
}

async function getSearchResults(query: string): Promise<SearchPayload> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

  try {
    const response = await fetch(`${apiUrl}/api/v1/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
    if (!response.ok) {
      return {};
    }

    return response.json() as Promise<SearchPayload>;
  } catch {
    return {};
  }
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams.q ?? '';
  const payload = query ? await getSearchResults(query) : {};
  const results = payload.results ?? { query: '', items: [], categories: [], brands: [] };
  const hasResults = (results.items?.length ?? 0) + (results.categories?.length ?? 0) + (results.brands?.length ?? 0) > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-purple-600">Discover products and brands</p>
        <h1 className="text-3xl font-bold text-gray-900">Search</h1>
        <p className="mt-2 text-gray-600">Find items, categories, and merchant brands in one place.</p>
      </div>

      <form className="mb-8">
        <div className="flex max-w-2xl">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search products, services, categories..."
            className="flex-1 rounded-l-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button type="submit" className="rounded-r-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3 font-medium text-white">
            Search
          </button>
        </div>
      </form>

      {!query ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">
          <h2 className="text-lg font-semibold text-gray-900">Start a new search</h2>
          <p className="mt-2">Enter a product name, category, or brand to see live results.</p>
        </div>
      ) : null}

      {query && !hasResults ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
          <h2 className="text-lg font-semibold text-gray-900">No matches yet</h2>
          <p className="mt-2">Try a broader term or browse categories directly.</p>
        </div>
      ) : null}

      {query && hasResults ? (
        <div className="space-y-8">
          <div>
            <p className="mb-4 text-gray-600">Results for: <strong>{results.query || query}</strong></p>
          </div>

          {results.categories && results.categories.length > 0 ? (
            <section>
              <h2 className="mb-3 text-xl font-semibold text-gray-900">Categories</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {results.categories.map((category) => (
                  <a key={category.slug} href={`/categories/${category.slug}`} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-xl">
                        {category.icon || '📦'}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{category.name}</h3>
                        {category.description ? <p className="text-sm text-gray-500">{category.description}</p> : null}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          {results.items && results.items.length > 0 ? (
            <section>
              <h2 className="mb-3 text-xl font-semibold text-gray-900">Products</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {results.items.map((item) => (
                  <a key={item.slug} href={`/categories/${item.slug}`} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">{item.name}</h3>
                        <p className="mt-1 text-sm text-gray-500">{item.brand || 'Brand pending'}</p>
                      </div>
                      {typeof item.priceCurrent === 'number' ? (
                        <div className="text-sm font-semibold text-purple-600">{item.priceCurrency || 'USD'} {item.priceCurrent}</div>
                      ) : null}
                    </div>
                    {item.description ? <p className="mt-3 text-sm text-gray-600">{item.description}</p> : null}
                    <div className="mt-4 flex flex-wrap gap-3 text-sm text-gray-500">
                      {typeof item.rating === 'number' ? <span>★ {item.rating.toFixed(1)}</span> : null}
                      {typeof item.reviewCount === 'number' ? <span>{item.reviewCount.toLocaleString()} reviews</span> : null}
                      {item.availability ? <span>{item.availability}</span> : null}
                    </div>
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          {results.brands && results.brands.length > 0 ? (
            <section>
              <h2 className="mb-3 text-xl font-semibold text-gray-900">Brands</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {results.brands.map((brand) => (
                  <div key={brand.slug} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="font-semibold text-gray-900">{brand.name}</h3>
                    {brand.description ? <p className="mt-2 text-sm text-gray-600">{brand.description}</p> : null}
                    {brand.verified ? <p className="mt-3 text-sm font-medium text-green-600">Verified brand</p> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
