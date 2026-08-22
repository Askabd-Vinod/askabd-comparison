import { Breadcrumb } from '../../components/breadcrumb';
import { KpiCard } from '../../components/kpi-card';
import { apiSafe } from '../../lib/api';
import { computePortfolioMetrics, type MigrationRun } from '../../lib/real-migration';
import { MigrationPortfolio } from './portfolio';

interface RealClient { id: string; name: string }

export default async function MigrationsPage() {
  // Authoritative migration data — GET /oc/migrations (oc_migration_runs table), created by
  // real schema-to-schema migration runs (MigrationExecutionService). Not sample data.
  const { migrations } = await apiSafe<{ migrations: MigrationRun[] }>('/api/v1/oc/migrations', { migrations: [] });
  const { clients } = await apiSafe<{ clients: RealClient[] }>('/api/v1/oc/clients', { clients: [] });
  const clientNameById: Record<string, string> = Object.fromEntries(clients.map(c => [c.id, c.name]));
  const metrics = computePortfolioMetrics(migrations);

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Migration Intelligence' }]} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Migration Intelligence</h1>
          <p className="text-sm text-gray-500 mt-0.5">Real PostgreSQL schema migration: planning, dry-run, execution, and validation</p>
        </div>
      </div>

      {/* Executive Summary — every figure below is drawn from oc_migration_runs; nothing is
          a cost/timeline/skills estimate, since this platform does not generate those. */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Executive Summary</h3>
        <p className="text-xs text-blue-700 leading-relaxed">
          {metrics.totalRuns} migration run(s) recorded.
          {metrics.completedRuns > 0 && ` ${metrics.completedRuns} completed.`}
          {metrics.failedRuns > 0 && ` ${metrics.failedRuns} failed.`}
          {metrics.inProgressRuns > 0 && ` ${metrics.inProgressRuns} currently running.`}
          {' '}Average mandatory-step completion:{' '}
          {metrics.avgMandatoryCompletionPercentage !== null ? `${metrics.avgMandatoryCompletionPercentage}%` : 'Not yet available'}.
        </p>
      </div>

      {/* KPI Grid — cost, timeline, required-skills, and confidence-score tiles were removed:
          this platform does not estimate migration cost/effort or generate AI confidence
          scores, so those numbers would be fabricated. */}
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/60 p-4 mb-8 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          <KpiCard label="Total Runs" value={metrics.totalRuns} description="Migration runs recorded on the platform." criteria="Count of oc_migration_runs rows." />
          <KpiCard label="Completed" value={metrics.completedRuns} color={metrics.completedRuns > 0 ? 'text-green-600' : undefined} description="Runs where all mandatory steps succeeded." criteria="status = 'completed' or 'validated'." />
          <KpiCard label="Failed" value={metrics.failedRuns} color={metrics.failedRuns > 0 ? 'text-red-600' : 'text-green-600'} description="Runs where a mandatory step failed." criteria="status = 'failed', 'dry-run-failed', or 'validation-failed'." />
          <KpiCard label="In Progress" value={metrics.inProgressRuns} color={metrics.inProgressRuns > 0 ? 'text-purple-600' : undefined} description="Runs currently executing or validating." criteria="status = 'running' or 'validating'." />
          <KpiCard label="Avg Mandatory Completion" value={metrics.avgMandatoryCompletionPercentage !== null ? `${metrics.avgMandatoryCompletionPercentage}%` : 'Not yet available'} color={metrics.avgMandatoryCompletionPercentage === null ? 'text-gray-400' : undefined} description="Average of each run's mandatory-step completion percentage." criteria="Mean of progress.percentage (mandatoryCompleted / mandatory) across runs." />
        </div>
      </div>

      {/* Migration Portfolio */}
      <MigrationPortfolio migrations={migrations} clientNameById={clientNameById} />
    </div>
  );
}
