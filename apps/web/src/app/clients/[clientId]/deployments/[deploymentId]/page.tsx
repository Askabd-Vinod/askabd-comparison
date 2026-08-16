import { CapabilityPlaceholder } from '../../capability-placeholder';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { mockClients } from '../../../../lib/mock-clients';
import { Breadcrumb } from '../../../../components/breadcrumb';
import { Timeline, TimelineEvent } from '../../../../components/timeline';
import { AIInsightsPanel } from '../../../../components/ai-insights';
import { Legend } from '../../../../components/legend';

interface Props { params: Promise<{ clientId: string; deploymentId: string }> }

export default async function DeploymentDetailPage({ params }: Props) {
  const { clientId, deploymentId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="[deployment Id]" description="[deployment Id] management for this client." />;
  const dep = client.deployments.find(d => d.id === deploymentId);
  if (!dep) notFound();

  const timeline: TimelineEvent[] = [
    { timestamp: dep.timestamp, title: 'Deployment initiated', type: 'deployment', description: `By ${dep.engineer}` },
    { timestamp: new Date(new Date(dep.timestamp).getTime() + 60000).toISOString(), title: 'Build started', type: 'info', description: `Pipeline: ${dep.pipeline}` },
    { timestamp: new Date(new Date(dep.timestamp).getTime() + 120000).toISOString(), title: 'Tests passed', type: 'info', description: 'All smoke tests green' },
    { timestamp: new Date(new Date(dep.timestamp).getTime() + 180000).toISOString(), title: 'Deployed to environment', type: 'deployment', description: dep.environment },
    { timestamp: new Date(new Date(dep.timestamp).getTime() + 240000).toISOString(), title: `Deployment ${dep.status}`, type: dep.status === 'success' ? 'change' : 'incident' },
  ];

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Clients', href: '/clients' },
        { label: client.name, href: `/clients/${clientId}` },
        { label: 'Deployments', href: `/clients/${clientId}/deployments` },
        { label: `v${dep.version}` },
      ]} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Deployment v{dep.version}</h1>
          <p className="text-sm text-gray-500">{dep.environment} • {dep.buildNumber} • {dep.gitCommit}</p>
        </div>
        <span className={`text-xs font-medium px-3 py-1 rounded ${dep.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{dep.status}</span>
      </div>

      <Legend type="deployment" />

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Summary */}
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Deployment Summary</h2>
            <div className="grid md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <Row label="Version" value={dep.version} />
                <Row label="Previous" value={dep.previousVersion} />
                <Row label="Build" value={dep.buildNumber} />
                <Row label="Commit" value={dep.gitCommit} />
                <Row label="Pipeline" value={dep.pipeline} />
                <Row label="Duration" value={dep.duration} />
              </div>
              <div className="space-y-2">
                <Row label="Engineer" value={dep.engineer} />
                <Row label="Reviewer" value="hello@askabd.com" />
                <Row label="Approver" value="hello@askabd.com" />
                <Row label="Environment" value={dep.environment} />
                <Row label="Risk" value={dep.status === 'success' ? 'Low' : 'High'} />
                <Row label="Rollback" value="Available" />
              </div>
            </div>
          </section>

          {/* Release Notes */}
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Release Notes</h2>
            <div className="space-y-3 text-xs">
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-1">Features Delivered</p>
                <ul className="list-disc list-inside text-gray-700 space-y-0.5">
                  <li>Enhanced monitoring dashboard with real-time metrics</li>
                  <li>Improved API response caching layer</li>
                  <li>New audit trail for configuration changes</li>
                </ul>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-1">Bug Fixes</p>
                <ul className="list-disc list-inside text-gray-700 space-y-0.5">
                  <li>Fixed connection pool exhaustion under high load</li>
                  <li>Resolved timezone rendering in deployment logs</li>
                </ul>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-1">Configuration Changes</p>
                <ul className="list-disc list-inside text-gray-700 space-y-0.5">
                  <li>Increased worker pool from 6 to 8</li>
                  <li>Updated rate limit thresholds</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Validation */}
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Deployment Checklist</h2>
            <div className="grid md:grid-cols-2 gap-2 text-xs">
              <Check label="Build Successful" passed />
              <Check label="Unit Tests" passed />
              <Check label="Integration Tests" passed />
              <Check label="Smoke Tests" passed />
              <Check label="QA Signoff" passed />
              <Check label="Security Review" passed />
              <Check label="Business Approval" passed />
              <Check label="Rollback Tested" passed />
              <Check label="Monitoring Verified" passed />
              <Check label="Documentation Updated" passed={dep.status === 'success'} />
            </div>
          </section>

          {/* Timeline */}
          <Timeline events={timeline} title="Deployment Timeline" />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Quick Links</h3>
            <div className="space-y-1.5">
              <QuickLink href={`/clients/${clientId}/environments`} label={`${dep.environment} Environment`} />
              <QuickLink href={`/clients/${clientId}/monitoring`} label="Post-Deploy Monitoring" />
              <QuickLink href={`/clients/${clientId}/incidents`} label="Related Incidents" />
              <QuickLink href={`/clients/${clientId}/audit`} label="Audit Trail" />
              <QuickLink href={`/clients/${clientId}/performance`} label="Performance Impact" />
            </div>
          </section>

          <AIInsightsPanel insights={[
            { type: 'recommendation', severity: 'low', title: 'Deployment health nominal', description: 'All post-deployment metrics within acceptable thresholds.', action: 'View Monitoring', href: `/clients/${clientId}/monitoring` },
            { type: 'prediction', severity: 'low', title: 'No rollback required', description: 'Error rate stable post-deployment. Confidence: 95%.' },
          ]} />

          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Post-Deployment Health</h3>
            <div className="space-y-2 text-xs">
              <MetricRow label="Error Rate" before="0.02%" after="0.03%" status="pass" />
              <MetricRow label="Latency p95" before="85ms" after="88ms" status="pass" />
              <MetricRow label="CPU" before="34%" after="36%" status="pass" />
              <MetricRow label="Memory" before="62%" after="63%" status="pass" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-medium text-gray-800">{value}</span></div>; }
function Check({ label, passed }: { label: string; passed: boolean }) { return <div className="flex items-center gap-2 py-1"><span className={passed ? 'text-green-600' : 'text-red-600'}>{passed ? '✓' : '✗'}</span><span className="text-gray-700">{label}</span></div>; }
function QuickLink({ href, label }: { href: string; label: string }) { return <Link href={href} className="block text-xs text-gray-600 hover:text-purple-600 py-1.5 px-2 rounded hover:bg-purple-50 transition">{label}</Link>; }
function MetricRow({ label, before, after, status }: { label: string; before: string; after: string; status: 'pass' | 'fail' | 'warning' }) { return <div className="flex items-center justify-between"><span className="text-gray-600">{label}</span><span className="text-gray-400">{before} → {after}</span><span className={`text-[10px] font-medium ${status === 'pass' ? 'text-green-600' : 'text-red-600'}`}>{status}</span></div>; }
