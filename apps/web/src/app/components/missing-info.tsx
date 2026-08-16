interface MissingItem {
  field: string;
  impact: 'high' | 'medium' | 'low';
  reason: string;
}

export function MissingInfoPanel({ completeness, items, blocked }: { completeness: number; items: MissingItem[]; blocked: string[] }) {
  if (items.length === 0) return null;
  const color = completeness >= 80 ? 'text-green-600' : completeness >= 60 ? 'text-orange-600' : 'text-red-600';

  return (
    <section className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Information Completeness</h3>
        <span className={`text-lg font-bold ${color}`}>{completeness}%</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
        <div className={`h-full rounded-full ${completeness >= 80 ? 'bg-green-500' : completeness >= 60 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${completeness}%` }} />
      </div>
      {items.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Missing Information</p>
          <div className="space-y-1.5">
            {items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-700">{item.field}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${item.impact === 'high' ? 'bg-red-100 text-red-600' : item.impact === 'medium' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>{item.impact}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {blocked.length > 0 && (
        <div className="border-t pt-3">
          <p className="text-[10px] text-red-600 font-medium mb-1">Cannot complete without missing data:</p>
          <ul className="text-[11px] text-gray-600 space-y-0.5">
            {blocked.map((b, i) => <li key={i}>• {b}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
