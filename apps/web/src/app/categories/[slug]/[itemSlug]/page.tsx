export default function ItemDetailPage({ params }: { params: { slug: string } }) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-4">
        <a href="/categories" className="hover:text-purple-600">Categories</a> / 
        <span className="text-gray-700 ml-1">{params.slug}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {/* Media Gallery */}
        <div>
          <div className="bg-gray-100 rounded-xl aspect-square flex items-center justify-center">
            <span className="text-gray-400 text-lg">Product Image</span>
          </div>
          <div className="flex gap-2 mt-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-16 h-16 bg-gray-100 rounded-lg border-2 border-transparent hover:border-purple-500 cursor-pointer"></div>
            ))}
          </div>
        </div>

        {/* Product Info */}
        <div>
          <h1 className="text-3xl font-bold mb-2">{params.slug.replace(/-/g, ' ')}</h1>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex text-yellow-400">{'★'.repeat(4)}{'☆'.repeat(1)}</div>
            <span className="text-gray-500">4.2 (128 reviews)</span>
          </div>
          <div className="mb-6">
            <span className="text-3xl font-bold gradient-text">$999</span>
            <span className="text-gray-400 line-through ml-3">$1,199</span>
            <span className="ml-3 bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-medium">17% off</span>
          </div>
          <div className="flex gap-3 mb-8">
            <button className="gradient-brand text-white px-6 py-3 rounded-lg font-medium">Compare</button>
            <button className="border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50">❤️ Wishlist</button>
            <button className="border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50">🔔 Price Alert</button>
          </div>

          {/* Merchant Offers */}
          <div className="border rounded-xl p-4">
            <h3 className="font-semibold mb-3">Available From</h3>
            {['Amazon', 'Flipkart', 'Official Store'].map((m) => (
              <div key={m} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="font-medium">{m}</span>
                <div className="flex items-center gap-3">
                  <span className="font-bold">$999</span>
                  <a href="#" className="text-purple-600 text-sm font-medium">View Offer →</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Specifications */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Specifications</h2>
        <div className="bg-white rounded-xl border overflow-hidden">
          {['Display', 'Processor', 'RAM', 'Storage', 'Battery', 'Camera'].map((spec) => (
            <div key={spec} className="flex border-b last:border-0">
              <div className="w-1/3 p-4 bg-gray-50 font-medium text-gray-700">{spec}</div>
              <div className="w-2/3 p-4">Loaded from specifications JSONB</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pros & Cons */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <div className="bg-green-50 rounded-xl p-6">
          <h3 className="font-semibold text-green-800 mb-3">✅ Pros</h3>
          <ul className="space-y-2 text-green-700">
            <li>Great camera quality</li>
            <li>Long battery life</li>
            <li>Premium build</li>
          </ul>
        </div>
        <div className="bg-red-50 rounded-xl p-6">
          <h3 className="font-semibold text-red-800 mb-3">❌ Cons</h3>
          <ul className="space-y-2 text-red-700">
            <li>Expensive</li>
            <li>No expandable storage</li>
          </ul>
        </div>
      </section>

      {/* Price History */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Price History</h2>
        <div className="bg-white rounded-xl border p-6 h-48 flex items-center justify-center text-gray-400">
          Price chart (connected to Price Engine API)
        </div>
      </section>

      {/* Reviews */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Reviews</h2>
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">
          Reviews loaded from API (review service)
        </div>
      </section>
    </div>
  );
}
