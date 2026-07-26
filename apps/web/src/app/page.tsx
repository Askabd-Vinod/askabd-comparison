export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="gradient-brand text-white py-24">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold mb-6">Compare Anything. Decide Smarter.</h1>
          <p className="text-xl opacity-90 mb-10 max-w-2xl mx-auto">
            Products, services, travel, insurance, education, banking — compare side by side and make the best decision.
          </p>
          <div className="max-w-2xl mx-auto">
            <form action="/search" className="flex">
              <input
                type="text" name="q" placeholder="Search products, services, or categories..."
                className="flex-1 px-6 py-4 rounded-l-xl text-gray-900 text-lg focus:outline-none"
              />
              <button type="submit" className="bg-purple-900 px-8 py-4 rounded-r-xl text-lg font-medium hover:bg-purple-800">
                Compare
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">What do you want to compare?</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[
            { name: 'Electronics', icon: '📱', slug: 'electronics' },
            { name: 'Travel', icon: '✈️', slug: 'travel' },
            { name: 'Insurance', icon: '🛡️', slug: 'insurance' },
            { name: 'Education', icon: '🎓', slug: 'education' },
            { name: 'Banking', icon: '🏦', slug: 'banking' },
            { name: 'Healthcare', icon: '🏥', slug: 'healthcare' },
            { name: 'Automobiles', icon: '🚗', slug: 'automobiles' },
            { name: 'Software', icon: '💻', slug: 'software' },
            { name: 'Real Estate', icon: '🏠', slug: 'real-estate' },
            { name: 'Credit Cards', icon: '💳', slug: 'credit-cards' },
            { name: 'Subscriptions', icon: '📺', slug: 'subscriptions' },
            { name: 'More...', icon: '➕', slug: 'all' },
          ].map((cat) => (
            <a key={cat.slug} href={`/categories/${cat.slug}`}
              className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow text-center border border-gray-100">
              <div className="text-4xl mb-3">{cat.icon}</div>
              <h3 className="font-semibold text-gray-900">{cat.name}</h3>
            </a>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-16">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6"><div className="text-4xl mb-4">🔍</div><h3 className="text-xl font-semibold mb-2">Search</h3><p className="text-gray-600">Find products and services across any category</p></div>
            <div className="p-6"><div className="text-4xl mb-4">⚖️</div><h3 className="text-xl font-semibold mb-2">Compare</h3><p className="text-gray-600">View side-by-side specs, prices, pros and cons</p></div>
            <div className="p-6"><div className="text-4xl mb-4">💰</div><h3 className="text-xl font-semibold mb-2">Save</h3><p className="text-gray-600">Find the best deals and make informed decisions</p></div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to make better decisions?</h2>
        <p className="text-gray-600 mb-8">Join thousands of users who save time and money with AskABD.</p>
        <a href="/login" className="gradient-brand text-white px-8 py-4 rounded-xl text-lg font-medium inline-block hover:opacity-90">
          Get Started Free
        </a>
      </section>
    </div>
  );
}
