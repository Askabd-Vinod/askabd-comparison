export default function DashboardPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white rounded-xl p-6 shadow-sm border"><p className="text-gray-500 text-sm">Saved Comparisons</p><p className="text-3xl font-bold mt-2">0</p></div>
        <div className="bg-white rounded-xl p-6 shadow-sm border"><p className="text-gray-500 text-sm">Wishlist Items</p><p className="text-3xl font-bold mt-2">0</p></div>
        <div className="bg-white rounded-xl p-6 shadow-sm border"><p className="text-gray-500 text-sm">Price Alerts</p><p className="text-3xl font-bold mt-2">0</p></div>
      </div>
      <section>
        <h2 className="text-xl font-semibold mb-4">Recent Comparisons</h2>
        <div className="bg-white rounded-lg p-8 text-center text-gray-500 border">
          <p>No comparisons yet. Start comparing to see your history here.</p>
          <a href="/categories" className="mt-4 inline-block gradient-brand text-white px-6 py-2 rounded-lg">Browse Categories</a>
        </div>
      </section>
    </div>
  );
}
