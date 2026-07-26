export default function WishlistPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">My Wishlist</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 border flex items-center gap-4">
          <div className="text-3xl">💰</div>
          <div><p className="text-sm text-gray-500">Active Price Alerts</p><p className="text-2xl font-bold">0</p></div>
        </div>
        <div className="bg-white rounded-xl p-4 border flex items-center gap-4">
          <div className="text-3xl">❤️</div>
          <div><p className="text-sm text-gray-500">Saved Items</p><p className="text-2xl font-bold">0</p></div>
        </div>
      </div>
      <div className="bg-white rounded-xl p-12 text-center border">
        <p className="text-xl text-gray-600 mb-4">Your wishlist is empty</p>
        <p className="text-gray-500 mb-6">Save items and set price alerts to get notified when prices drop</p>
        <a href="/categories" className="gradient-brand text-white px-6 py-3 rounded-lg inline-block">Browse Products</a>
      </div>
    </div>
  );
}
