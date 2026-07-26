export default function CategoriesPage() {
  const categories = [
    { name: 'Electronics', icon: '📱', slug: 'electronics', count: 2500 },
    { name: 'Travel & Hotels', icon: '✈️', slug: 'travel', count: 1200 },
    { name: 'Insurance', icon: '🛡️', slug: 'insurance', count: 450 },
    { name: 'Education', icon: '🎓', slug: 'education', count: 800 },
    { name: 'Banking & Loans', icon: '🏦', slug: 'banking', count: 350 },
    { name: 'Healthcare', icon: '🏥', slug: 'healthcare', count: 600 },
    { name: 'Automobiles', icon: '🚗', slug: 'automobiles', count: 900 },
    { name: 'Software & SaaS', icon: '💻', slug: 'software', count: 1500 },
    { name: 'Real Estate', icon: '🏠', slug: 'real-estate', count: 700 },
    { name: 'Credit Cards', icon: '💳', slug: 'credit-cards', count: 200 },
    { name: 'Subscriptions', icon: '📺', slug: 'subscriptions', count: 300 },
    { name: 'Flights', icon: '🛫', slug: 'flights', count: 1000 },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">All Categories</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.map((cat) => (
          <a key={cat.slug} href={`/categories/${cat.slug}`}
            className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition border border-gray-100 flex items-center gap-4">
            <div className="text-4xl">{cat.icon}</div>
            <div>
              <h3 className="font-semibold text-lg text-gray-900">{cat.name}</h3>
              <p className="text-sm text-gray-500">{cat.count.toLocaleString()} items to compare</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
