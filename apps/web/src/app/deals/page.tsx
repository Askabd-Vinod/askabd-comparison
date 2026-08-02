import { apiSafe } from '../lib/api';

interface Offer { id: string; title: string; description?: string; code?: string; discountValue?: number; discountType?: string; type: string; merchantId?: string; itemId?: string; validFrom: string; validUntil?: string; url?: string; status: string; priority: number; }

export default async function DealsPage() {
  const { offers } = await apiSafe<{ offers: Offer[] }>('/api/v1/offers/trending?limit=20', { offers: [] });

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Deals & Offers</h1>
      <p className="text-gray-600 mb-8">Best deals across all categories — live from Price Engine</p>

      {offers.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-lg text-gray-600">No active deals right now</p>
          <p className="text-sm text-gray-400 mt-2">Deals appear here when merchants create offers via the API</p>
          <p className="text-xs text-gray-400 mt-4">POST /api/v1/offers to create a deal</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {offers.map(offer => (
            <div key={offer.id} className="bg-white rounded-xl border overflow-hidden hover:shadow-md transition">
              <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-3 text-center text-sm font-medium">
                {offer.type === 'discount' ? 'Discount' : offer.type === 'flash_sale' ? 'Flash Sale' : 'Special Offer'}
              </div>
              <div className="p-5">
                <h3 className="font-semibold text-gray-900">{offer.title}</h3>
                {offer.description && <p className="text-gray-500 text-sm mt-1">{offer.description}</p>}
                <div className="mt-4 flex items-center gap-3">
                  {offer.discountValue && (
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-medium">
                      {offer.discountType === 'percentage' ? `${offer.discountValue}% OFF` : `$${offer.discountValue} OFF`}
                    </span>
                  )}
                  {offer.code && <span className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">{offer.code}</span>}
                </div>
                {offer.validUntil && <p className="text-xs text-gray-400 mt-3">Valid until {new Date(offer.validUntil).toLocaleDateString()}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
