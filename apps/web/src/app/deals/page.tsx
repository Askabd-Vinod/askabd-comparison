export default function DealsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Deals & Offers</h1>
      <p className="text-gray-600 mb-8">Best deals across all categories, updated in real-time</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-white rounded-xl border overflow-hidden hover:shadow-md transition">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-3 text-center text-sm font-medium">
              Limited Time Offer
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold">Deal #{i}</h3>
                <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-medium">20% OFF</span>
              </div>
              <p className="text-gray-500 text-sm mb-4">Great offer from verified merchant</p>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold gradient-text">$499</span>
                <a href="#" className="text-purple-600 font-medium text-sm">View Deal →</a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
