export default function ComparePage({ searchParams }: { searchParams: { items?: string; category?: string } }) {
  const itemIds = searchParams.items?.split(',') ?? [];
  const category = searchParams.category ?? '';

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Compare{category && <span className="text-gray-500 ml-2">in {category}</span>}</h1>
        <div className="flex gap-3">
          <button className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Show Differences Only</button>
          <button className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Export</button>
          <button className="gradient-brand text-white px-4 py-2 rounded-lg text-sm">Share Comparison</button>
        </div>
      </div>

      {itemIds.length < 2 ? (
        <div className="bg-white rounded-xl p-12 text-center border">
          <p className="text-xl text-gray-600 mb-4">Select 2 or more items to compare</p>
          <a href="/categories" className="gradient-brand text-white px-6 py-3 rounded-lg inline-block">Browse Categories</a>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-4 bg-gray-50 sticky left-0 z-10 min-w-[200px]">Attribute</th>
                {itemIds.map((id, i) => (
                  <th key={id} className="p-4 min-w-[250px] text-center">
                    <div className="bg-white rounded-lg p-4 shadow-sm border">
                      <div className="w-20 h-20 bg-gray-100 rounded-lg mx-auto mb-3"></div>
                      <p className="font-semibold">Product {i + 1}</p>
                      <p className="text-sm text-gray-500">Loading...</p>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['Price', 'Rating', 'Brand', 'Availability'].map((attr) => (
                <tr key={attr} className="border-b hover:bg-blue-50/50">
                  <td className="p-4 font-medium text-gray-700 bg-gray-50 sticky left-0">{attr}</td>
                  {itemIds.map((id) => (
                    <td key={`${id}-${attr}`} className="p-4 text-center">
                      <span className="text-gray-400">-</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-center text-sm text-gray-400 mt-4">Attributes loaded dynamically from comparison template</p>
        </div>
      )}

      {/* Best Value Indicator */}
      {itemIds.length >= 2 && (
        <div className="mt-8 bg-green-50 border border-green-200 rounded-xl p-6">
          <h3 className="font-semibold text-green-800 text-lg">🏆 Best Value Recommendation</h3>
          <p className="text-green-700 mt-2">Based on price, rating, and features — powered by comparison template weights</p>
        </div>
      )}
    </div>
  );
}
