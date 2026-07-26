export default function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const query = searchParams.q ?? '';
  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-6">Search</h1>
      <form className="mb-8">
        <div className="flex max-w-2xl">
          <input type="text" name="q" defaultValue={query} placeholder="Search products, services, categories..."
            className="flex-1 border border-gray-300 rounded-l-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <button type="submit" className="gradient-brand text-white px-6 py-3 rounded-r-lg font-medium">Search</button>
        </div>
      </form>
      {query && (
        <div>
          <p className="text-gray-600 mb-4">Results for: <strong>{query}</strong></p>
          <div className="bg-white rounded-lg p-8 text-center text-gray-500 border">
            <p className="text-lg">Search results will appear here</p>
            <p className="text-sm mt-2">Connected to Search Platform via API Gateway</p>
          </div>
        </div>
      )}
    </div>
  );
}
