import Link from 'next/link';
import { apiSafe } from './lib/api';

export default async function HomePage() {
  const [cats, offers] = await Promise.all([
    apiSafe<{ categories: any[] }>('/api/v1/categories', { categories: [] }),
    apiSafe<{ offers: any[] }>('/api/v1/offers/trending?limit=6', { offers: [] }),
  ]);

  return (
    <div className="animate-in">
      {/* Hero Search */}
      <section className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white py-16 lg:py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl lg:text-5xl font-bold mb-4">Compare • Decide • Save</h1>
          <p className="text-lg text-gray-300 mb-8">Find the best products, services, and deals across every industry</p>
          <form action="/search" className="flex max-w-2xl mx-auto shadow-2xl rounded-xl overflow-hidden">
            <input type="text" name="q" placeholder="Search products, services, categories..." className="flex-1 px-6 py-4 text-gray-900 text-lg focus:outline-none" />
            <button type="submit" className="gradient-brand px-8 py-4 font-semibold hover:opacity-90 transition">Search</button>
          </form>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 py-14">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold">Browse Categories</h2>
          <Link href="/categories" className="text-sm text-purple-600 font-medium hover:text-purple-700">View all →</Link>
        </div>
        {cats.categories.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {cats.categories.slice(0, 12).map((cat: any) => (
              <Link key={cat.slug} href={`/categories/${cat.slug}`} className="card p-5 flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center text-lg">{cat.icon || '📦'}</div>
                <div>
                  <p className="font-medium text-sm">{cat.name}</p>
                  <p className="text-xs text-gray-500">{cat.itemCount ?? 0} items</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card p-8 text-center text-gray-500">
            <p>Categories will appear as they are published.</p>
          </div>
        )}
      </section>

      {/* Trending Deals */}
      <section className="bg-gray-50 py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold">Trending Deals</h2>
            <Link href="/deals" className="text-sm text-purple-600 font-medium hover:text-purple-700">View all →</Link>
          </div>
          {offers.offers.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {offers.offers.map((offer: any) => (
                <div key={offer.id} className="card p-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-sm">{offer.title}</h3>
                    {offer.discountValue && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">{offer.discountType === 'percentage' ? `${offer.discountValue}%` : `$${offer.discountValue}`} OFF</span>}
                  </div>
                  {offer.description && <p className="text-xs text-gray-500">{offer.description}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-8 text-center text-gray-500">
              <p>Deals will appear as merchants publish offers.</p>
            </div>
          )}
        </div>
      </section>

      {/* Quick Compare CTA */}
      <section className="max-w-4xl mx-auto px-4 py-14 text-center">
        <h2 className="text-2xl font-bold mb-3">Ready to compare?</h2>
        <p className="text-gray-600 mb-6">Select products from any category and compare side-by-side — no account required.</p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/categories" className="gradient-brand text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90">Browse Categories</Link>
          <Link href="/search" className="border border-gray-300 px-6 py-3 rounded-lg font-semibold text-gray-700 hover:bg-gray-50">Search Products</Link>
        </div>
      </section>
    </div>
  );
}
