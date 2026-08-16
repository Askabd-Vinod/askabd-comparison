export interface Solution {
  immediateFix: string;
  permanentFix: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  effort: string;
  businessImpact: string;
  technicalImpact: string;
  dependencies: string[];
  validationSteps: string[];
  rollbackPlan: string;
  owner: string;
  status: 'pending' | 'in-progress' | 'completed';
}

export function SolutionRecommendation({ solution, title }: { solution: Solution; title?: string }) {
  const priorityColor: Record<string, string> = { critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-blue-100 text-blue-700' };

  return (
    <section className="bg-white rounded-xl border p-5">
      <h3 className="font-semibold text-sm mb-3">{title || '💡 Recommended Solution'}</h3>
      <div className="space-y-3 text-xs">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${priorityColor[solution.priority]}`}>{solution.priority}</span>
          <span className="text-gray-400">Effort: {solution.effort}</span>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${solution.status === 'completed' ? 'bg-green-100 text-green-700' : solution.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{solution.status}</span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-gray-500 uppercase mb-1">Immediate Fix</p>
            <p className="text-gray-700">{solution.immediateFix}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase mb-1">Permanent Fix</p>
            <p className="text-gray-700">{solution.permanentFix}</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-gray-500 uppercase mb-1">Business Impact</p>
            <p className="text-gray-700">{solution.businessImpact}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase mb-1">Technical Impact</p>
            <p className="text-gray-700">{solution.technicalImpact}</p>
          </div>
        </div>
        {solution.dependencies.length > 0 && (
          <div>
            <p className="text-[10px] text-gray-500 uppercase mb-1">Dependencies</p>
            <div className="flex flex-wrap gap-1">{solution.dependencies.map((d, i) => <span key={i} className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">{d}</span>)}</div>
          </div>
        )}
        {solution.validationSteps.length > 0 && (
          <div>
            <p className="text-[10px] text-gray-500 uppercase mb-1">Validation Steps</p>
            <ol className="list-decimal list-inside text-gray-600 space-y-0.5">{solution.validationSteps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </div>
        )}
        <div className="flex items-center gap-4 pt-2 border-t text-[11px] text-gray-500">
          <span>Rollback: {solution.rollbackPlan}</span>
          <span>Owner: {solution.owner}</span>
        </div>
      </div>
    </section>
  );
}
