import Link from 'next/link';
import { AssessmentReport, getConfidenceColor, getConfidencePercent, Priority, ConfidenceLevel } from '../lib/assessment-standard';

export function AssessmentReportView({ report, clientId }: { report: AssessmentReport; clientId: string }) {
  return (
    <div className="space-y-6">
      {/* Section 1: Executive Summary */}
      <section className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold text-lg mb-4">Executive Summary</h2>
        <div className="grid md:grid-cols-2 gap-4 text-xs mb-4">
          <div className="space-y-2">
            <div><p className="text-[10px] text-gray-500 uppercase">Business Summary</p><p className="text-gray-800">{report.executiveSummary.businessSummary}</p></div>
            <div><p className="text-[10px] text-gray-500 uppercase">Current Health</p><p className="text-gray-800">{report.executiveSummary.currentHealth}</p></div>
            <div><p className="text-[10px] text-gray-500 uppercase">Business Impact</p><p className="text-gray-800">{report.executiveSummary.businessImpact}</p></div>
          </div>
          <div className="space-y-2">
            <div><p className="text-[10px] text-gray-500 uppercase">Technical Summary</p><p className="text-gray-800">{report.executiveSummary.technicalSummary}</p></div>
            <div><p className="text-[10px] text-gray-500 uppercase">Overall Status</p><p className="text-gray-800">{report.executiveSummary.overallStatus}</p></div>
            <div><p className="text-[10px] text-gray-500 uppercase">Technical Impact</p><p className="text-gray-800">{report.executiveSummary.technicalImpact}</p></div>
          </div>
        </div>
        <div className="flex gap-3">
          <PriorityBadge label="Risk" priority={report.executiveSummary.overallRisk} />
          <PriorityBadge label="Priority" priority={report.executiveSummary.overallPriority} />
          <ConfidenceBadge level={report.overallConfidence} />
        </div>
      </section>

      {/* Section 2: Evidence */}
      <section className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Evidence ({report.evidence.length})</h2>
          <span className="text-xs text-gray-500">Completeness: <span className="font-bold">{report.evidenceCompleteness}%</span></span>
        </div>
        <div className="space-y-2">
          {report.evidence.map(ev => (
            <div key={ev.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 text-xs">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${ev.quality === 'very-high' || ev.quality === 'high' ? 'bg-green-500' : ev.quality === 'medium' ? 'bg-orange-500' : 'bg-red-500'}`} />
                <span className="font-medium">{ev.description}</span>
                <span className="text-gray-400">({ev.type})</span>
              </div>
              <div className="flex items-center gap-3 text-gray-400">
                <span>{ev.source}</span>
                <span>{ev.date}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 4: Gap Analysis */}
      {report.gaps.length > 0 && (
        <section className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold mb-4">Gap Analysis ({report.gaps.length} gaps)</h2>
          <div className="space-y-2">
            {report.gaps.map((gap, i) => (
              <div key={i} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{gap.item}</span>
                  <PriorityBadge label="" priority={gap.priority} />
                </div>
                <p className="text-[11px] text-gray-500"><strong>Business:</strong> {gap.businessImpact}</p>
                <p className="text-[11px] text-gray-500"><strong>Technical:</strong> {gap.technicalImpact}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 5: Supported Conclusions */}
      <section className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold mb-4">What We Can Conclude</h2>
        <div className="space-y-2">
          {report.conclusions.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-xs py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" />
              <div>
                <p className="text-gray-800">{c.statement}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Evidence: {c.evidenceRefs.join(', ')} • Confidence: {c.confidence}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 6: Limitations */}
      {report.limitations.length > 0 && (
        <section className="bg-white rounded-xl border border-orange-200 bg-orange-50/30 p-5">
          <h2 className="font-semibold mb-4 text-orange-800">What We Cannot Conclude</h2>
          <div className="space-y-2">
            {report.limitations.map((lim, i) => (
              <div key={i} className="text-xs py-1.5">
                <p className="font-medium text-orange-800">{lim.area}</p>
                <p className="text-orange-700 mt-0.5">Missing: {lim.missingInfo}</p>
                <p className="text-orange-600 mt-0.5">Impact: {lim.impact}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 7: Confidence */}
      <section className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Confidence Assessment</h2>
          <ConfidenceBadge level={report.overallConfidence} />
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
          <div className="h-full rounded-full bg-purple-500" style={{ width: `${getConfidencePercent(report.overallConfidence)}%` }} />
        </div>
        <p className="text-xs text-gray-600">{report.confidenceRationale}</p>
      </section>

      {/* Section 9: Recommendations */}
      {report.recommendations.length > 0 && (
        <section className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold mb-4">Recommendations ({report.recommendations.length})</h2>
          <div className="space-y-3">
            {report.recommendations.map(rec => (
              <div key={rec.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{rec.title}</span>
                  <PriorityBadge label="" priority={rec.priority} />
                </div>
                <div className="grid md:grid-cols-2 gap-2 text-[11px] text-gray-600">
                  <div><strong className="text-gray-500">Business Reason:</strong> {rec.businessReason}</div>
                  <div><strong className="text-gray-500">Expected Benefit:</strong> {rec.expectedBenefit}</div>
                  <div><strong className="text-gray-500">Effort:</strong> {rec.estimatedEffort}</div>
                  <div><strong className="text-gray-500">Timeline:</strong> {rec.timeline}</div>
                  <div><strong className="text-gray-500">Owner:</strong> {rec.owner}</div>
                  <div><strong className="text-gray-500">Evidence:</strong> {rec.evidenceRefs.join(', ')}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Export */}
      <section className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Export & Share</h2>
          <div className="flex gap-2">
            <button className="text-xs bg-purple-50 text-purple-600 px-3 py-1.5 rounded font-medium hover:bg-purple-100">PDF</button>
            <button className="text-xs bg-purple-50 text-purple-600 px-3 py-1.5 rounded font-medium hover:bg-purple-100">Excel</button>
            <button className="text-xs bg-purple-50 text-purple-600 px-3 py-1.5 rounded font-medium hover:bg-purple-100">CSV</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PriorityBadge({ label, priority }: { label: string; priority: Priority }) {
  const colors: Record<Priority, string> = { critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-blue-100 text-blue-700' };
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${colors[priority]}`}>{label ? `${label}: ` : ''}{priority}</span>;
}

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${getConfidenceColor(level)}`}>Confidence: {level}</span>;
}
