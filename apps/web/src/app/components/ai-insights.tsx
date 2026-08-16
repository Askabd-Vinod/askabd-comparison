import Link from 'next/link';

interface Insight {
  type: 'risk' | 'recommendation' | 'prediction' | 'issue';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action?: string;
  href?: string;
}

export function AIInsightsPanel({ insights, title }: { insights: Insight[]; title?: string }) {
  if (insights.length === 0) return null;
  const severityColor: Record<string, string> = { critical: 'border-red-200 bg-red-50', high: 'border-orange-200 bg-orange-50', medium: 'border-yellow-200 bg-yellow-50', low: 'border-blue-200 bg-blue-50' };
  const severityDot: Record<string, string> = { critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-yellow-500', low: 'bg-blue-500' };
  const typeLabel: Record<string, string> = { risk: '⚠️ Risk', recommendation: '💡 Recommendation', prediction: '🔮 Prediction', issue: '🚨 Issue' };

  return (
    <section className="bg-white rounded-xl border p-5">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <span className="text-purple-600">✨</span>
        {title || 'AI Insights'}
      </h3>
      <div className="space-y-2">
        {insights.map((insight, i) => (
          <div key={i} className={`rounded-lg border p-3 ${severityColor[insight.severity]}`}>
            <div className="flex items-start gap-2">
              <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${severityDot[insight.severity]}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] text-gray-500">{typeLabel[insight.type]}</span>
                  <span className="text-[10px] text-gray-400 capitalize">{insight.severity}</span>
                </div>
                <p className="text-xs font-medium text-gray-800">{insight.title}</p>
                <p className="text-[11px] text-gray-600 mt-0.5">{insight.description}</p>
                {insight.action && (
                  insight.href ? (
                    <Link href={insight.href} className="text-[10px] text-purple-600 font-medium mt-1 inline-block hover:text-purple-800">{insight.action} →</Link>
                  ) : (
                    <p className="text-[10px] text-purple-600 font-medium mt-1">{insight.action}</p>
                  )
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
