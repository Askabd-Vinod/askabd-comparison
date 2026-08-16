'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '../../components/breadcrumb';

type AppEnvironment = 'development' | 'staging' | 'production';
type ServiceStatus = 'RUNNING' | 'STARTING' | 'STOPPED' | 'UNHEALTHY' | 'NOT_CONFIGURED' | 'UNKNOWN' | 'RECOVERING' | 'RECOVERY_FAILED';
type ServiceCategory = 'application' | 'data' | 'communication' | 'external';

interface ServiceHealth {
  id: string;
  name: string;
  category: ServiceCategory;
  environment: AppEnvironment;
  endpoint?: string;
  port?: number;
  protocol: 'http' | 'tcp' | 'smtp' | 'self';
  status: ServiceStatus;
  healthy: boolean;
  responseMs?: number;
  lastChecked: string;
  lastError?: string;
  dependencies: string[];
  actions: string[];
  recoverable: boolean;
  recoveryMechanism?: string;
  affectedFeatures: string[];
}

interface EnvironmentConfig {
  environment: AppEnvironment;
  label: string;
  description: string;
  isActive: boolean;
  services: ServiceHealth[];
}

interface PlatformServicesResponse {
  activeEnvironment: AppEnvironment;
  timestamp: string;
  environments: EnvironmentConfig[];
}

interface RecoveryEntry {
  id: string;
  serviceId: string;
  serviceName: string;
  action: string;
  status: 'started' | 'success' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

const statusColors: Record<ServiceStatus, string> = {
  RUNNING: 'bg-green-100 text-green-700',
  STARTING: 'bg-yellow-100 text-yellow-700',
  STOPPED: 'bg-red-100 text-red-700',
  UNHEALTHY: 'bg-orange-100 text-orange-700',
  NOT_CONFIGURED: 'bg-gray-100 text-gray-500',
  UNKNOWN: 'bg-gray-100 text-gray-500',
  RECOVERING: 'bg-blue-100 text-blue-700',
  RECOVERY_FAILED: 'bg-red-100 text-red-700',
};

const statusIcons: Record<ServiceStatus, string> = {
  RUNNING: '🟢', STARTING: '🟡', STOPPED: '🔴', UNHEALTHY: '🟠',
  NOT_CONFIGURED: '⚪', UNKNOWN: '⚪', RECOVERING: '🔄', RECOVERY_FAILED: '❌',
};

const categoryIcons: Record<ServiceCategory, string> = {
  application: '🖥️', data: '🗄️', communication: '📧', external: '🔗',
};

const protocolLabels: Record<string, string> = {
  http: 'HTTP', tcp: 'TCP', smtp: 'SMTP', self: 'Internal',
};

const envTabColors: Record<AppEnvironment, { active: string; inactive: string }> = {
  development: { active: 'bg-green-600 text-white', inactive: 'text-green-700 hover:bg-green-50' },
  staging: { active: 'bg-yellow-600 text-white', inactive: 'text-yellow-700 hover:bg-yellow-50' },
  production: { active: 'bg-red-600 text-white', inactive: 'text-red-700 hover:bg-red-50' },
};

function classifyPerformance(ms: number | undefined): { label: string; color: string } {
  if (ms === undefined) return { label: 'N/A', color: 'text-gray-400' };
  if (ms < 100) return { label: 'Excellent', color: 'text-green-600' };
  if (ms < 500) return { label: 'Good', color: 'text-green-500' };
  if (ms < 1000) return { label: 'Acceptable', color: 'text-yellow-600' };
  if (ms < 2000) return { label: 'Slow', color: 'text-orange-600' };
  return { label: 'Degraded', color: 'text-red-600' };
}

export default function PlatformServicesPage() {
  const [data, setData] = useState<PlatformServicesResponse | null>(null);
  const [selectedEnv, setSelectedEnv] = useState<AppEnvironment>('development');
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [recovering, setRecovering] = useState<Record<string, boolean>>({});
  const [recoveryResults, setRecoveryResults] = useState<Record<string, RecoveryEntry>>({});
  const [history, setHistory] = useState<RecoveryEntry[]>([]);

  const ago = () => { const s = Math.round((Date.now() - lastRefresh.getTime()) / 1000); return s < 5 ? 'just now' : `${s}s ago`; };

  const fetchData = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`${API}/platform/services`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PlatformServicesResponse = await res.json();
      setData(json);
      setSelectedEnv(prev => prev || json.activeEnvironment);
      setError(null);
      setLastRefresh(new Date());
    } catch (err: any) {
      // Retry once silently before showing error
      try {
        await new Promise(r => setTimeout(r, 2000));
        const retryRes = await fetch(`${API}/platform/services`);
        if (retryRes.ok) {
          const json: PlatformServicesResponse = await retryRes.json();
          setData(json);
          setSelectedEnv(prev => prev || json.activeEnvironment);
          setError(null);
          setLastRefresh(new Date());
          return;
        }
      } catch { /* retry also failed */ }
      setError('Service health check unavailable. Retrying automatically...');
      // Auto-retry after 5s
      setTimeout(() => fetchData(), 5000);
    } finally {
      setChecking(false);
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API}/platform/services/recovery-history`);
      if (res.ok) {
        const json = await res.json();
        setHistory(json.history || []);
      }
    } catch { /* non-blocking */ }
  }, []);

  useEffect(() => {
    fetchData();
    fetchHistory();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData, fetchHistory]);

  async function recoverService(serviceId: string) {
    setRecovering(prev => ({ ...prev, [serviceId]: true }));
    setRecoveryResults(prev => { const next = { ...prev }; delete next[serviceId]; return next; });
    try {
      const res = await fetch(`${API}/platform/services/${serviceId}/recover`, { method: 'POST' });
      const result: RecoveryEntry = await res.json();
      setRecoveryResults(prev => ({ ...prev, [serviceId]: result }));
      // Refresh health data and history after recovery
      setTimeout(fetchData, 1000);
      setTimeout(fetchHistory, 1000);
    } catch (err: any) {
      setRecoveryResults(prev => ({ ...prev, [serviceId]: { id: '', serviceId, serviceName: serviceId, action: 'recover', status: 'failed', startedAt: new Date().toISOString(), error: err.message } }));
    } finally {
      setRecovering(prev => ({ ...prev, [serviceId]: false }));
    }
  }

  if (loading) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 py-6">
        <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Platform', href: '/platform' }, { label: 'Environment & Service Health' }]} />
        <div className="mt-8 text-center text-gray-500 text-sm">Loading service health...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 py-6">
        <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Platform', href: '/platform' }, { label: 'Environment & Service Health' }]} />
        <div className="mt-8 bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 font-medium">⚠ {error || 'Failed to load service data'}</p>
          <button onClick={fetchData} className="mt-3 text-sm text-red-600 underline hover:text-red-800">Retry</button>
        </div>
      </div>
    );
  }

  const activeConfig = data.environments.find(e => e.environment === selectedEnv);
  const isActiveRuntime = selectedEnv === data.activeEnvironment;
  const allServices = activeConfig?.services || [];
  const healthyCount = allServices.filter(s => s.healthy).length;
  const totalCount = allServices.length;
  const overallHealthy = totalCount > 0 && healthyCount === totalCount;

  const grouped = allServices.reduce<Record<ServiceCategory, ServiceHealth[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {} as Record<ServiceCategory, ServiceHealth[]>);

  const categoryOrder: ServiceCategory[] = ['application', 'data', 'communication', 'external'];
  const categoryLabels: Record<ServiceCategory, string> = {
    application: 'Application Services', data: 'Data Services',
    communication: 'Communication Services', external: 'External Integrations',
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Platform', href: '/platform' }, { label: 'Environment & Service Health' }]} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Environment & Service Health</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time dependency monitoring + one-click recovery</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-400">Updated: {ago()}</span>
          {checking && <span className="text-[10px] text-blue-600 animate-pulse">Checking…</span>}
          <button onClick={() => { fetchData(); fetchHistory(); }} disabled={checking} className={`text-xs font-medium px-3 py-1.5 rounded-lg transition ${checking ? 'text-blue-600 bg-blue-50 animate-pulse' : 'text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100'}`}>
            {checking ? '⟳ Checking...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Environment Banner */}
      <div className={`rounded-xl border p-4 mb-6 flex items-center justify-between ${overallHealthy ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{overallHealthy ? '✓' : '⚠'}</span>
          <div>
            <p className="font-bold text-gray-900">ASKABD PLATFORM</p>
            <p className="text-sm text-gray-600">Environment: <span className="font-semibold uppercase">{data.activeEnvironment}</span></p>
            <p className="text-[10px] text-gray-400">{data.activeEnvironment.toUpperCase()} • {activeConfig?.description}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-lg font-bold ${overallHealthy ? 'text-green-700' : 'text-orange-700'}`}>
            {overallHealthy ? '🟢' : '🟠'} {healthyCount}/{totalCount} Healthy
          </p>
        </div>
      </div>

      {/* Environment Tabs */}
      <div className="flex gap-2 mb-6">
        {data.environments.map(env => {
          const isSelected = selectedEnv === env.environment;
          const colors = envTabColors[env.environment];
          return (
            <button key={env.environment} onClick={() => setSelectedEnv(env.environment)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${isSelected ? colors.active : colors.inactive} border ${isSelected ? 'border-transparent' : 'border-gray-200'}`}>
              {env.label}{env.isActive && <span className="ml-1.5 text-[9px] opacity-75">●</span>}
            </button>
          );
        })}
      </div>

      {!isActiveRuntime && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚪</span>
            <h3 className="font-semibold text-gray-700">{selectedEnv.toUpperCase()} — NOT DEPLOYED</h3>
          </div>
          <p className="text-sm text-gray-600 mb-3">This environment is not currently running. No health data is available.</p>
          <div className="text-xs text-gray-500 space-y-1">
            <p className="font-medium">Why?</p>
            <p>The {selectedEnv} environment has not been provisioned. AskABD is currently running in <span className="font-bold uppercase">{data.activeEnvironment}</span> mode only.</p>
            <p className="font-medium mt-2">Next steps to deploy {selectedEnv}:</p>
            {selectedEnv === 'staging' && (
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>Configure AWS credentials</li>
                <li>Run <code className="bg-gray-200 px-1 rounded">terraform apply -var-file=staging.tfvars</code></li>
                <li>Build and push Docker images to ECR</li>
                <li>Run database migrations against staging RDS</li>
                <li>Deploy ECS services</li>
              </ol>
            )}
            {selectedEnv === 'production' && (
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>Complete staging validation first</li>
                <li>Configure production AWS resources</li>
                <li>Configure production secrets</li>
                <li>Deploy with manual approval gate</li>
                <li>Verify health and run smoke tests</li>
              </ol>
            )}
          </div>
        </div>
      )}

      {/* Service Cards */}
      {isActiveRuntime && categoryOrder.map(cat => {
        const services = grouped[cat];
        if (!services || services.length === 0) return null;
        return (
          <section key={cat} className="mb-6">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
              <span>{categoryIcons[cat]}</span> {categoryLabels[cat]}
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map(svc => (
                <ServiceCard key={svc.id} service={svc} allServices={allServices}
                  isRecovering={recovering[svc.id] || false}
                  recoveryResult={recoveryResults[svc.id]}
                  onRecover={() => recoverService(svc.id)} />
              ))}
            </div>
          </section>
        );
      })}

      {/* Dependency Graph */}
      {isActiveRuntime && allServices.length > 0 && (
        <section className="mt-6 bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-lg mb-4">Dependency Graph</h2>
          <div className="space-y-2">
            {allServices.filter(s => s.dependencies.length > 0).map(svc => (
              <div key={svc.id} className="flex items-center gap-2 text-sm flex-wrap">
                <span className={`w-2 h-2 rounded-full ${svc.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-medium">{svc.name}</span>
                <span className="text-gray-400">→</span>
                {svc.dependencies.map(depId => {
                  const dep = allServices.find(s => s.id === depId);
                  return (
                    <span key={depId} className={`text-xs px-2 py-0.5 rounded ${dep?.healthy ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {dep?.healthy ? '✓' : '✗'} {dep?.name || depId}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recovery History */}
      {isActiveRuntime && history.length > 0 && (
        <section className="mt-6 bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-lg mb-4">Recovery History</h2>
          <div className="space-y-2">
            {history.map(entry => (
              <div key={entry.id} className="flex items-center gap-3 text-xs py-2 border-b last:border-0">
                <span className="text-gray-400 font-mono w-16 shrink-0">{new Date(entry.startedAt).toLocaleTimeString()}</span>
                <span className="font-medium">{entry.serviceName || entry.serviceId}</span>
                <span className="text-gray-500">{entry.action}</span>
                <span className={`px-1.5 py-0.5 rounded font-bold ${entry.status === 'success' ? 'bg-green-100 text-green-700' : entry.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {entry.status.toUpperCase()}
                </span>
                {entry.durationMs && <span className="text-gray-400">{(entry.durationMs / 1000).toFixed(1)}s</span>}
                {entry.error && <span className="text-red-500 truncate max-w-[200px]" title={entry.error}>{entry.error}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick Links */}
      <div className="mt-6 flex items-center gap-3 text-xs text-gray-500">
        <Link href="/platform" className="hover:text-purple-600 underline">← Platform Overview</Link>
        <span>•</span>
        <a href="http://localhost:8025" target="_blank" rel="noopener noreferrer" className="hover:text-purple-600 underline">Open Mailpit</a>
        <span>•</span>
        <a href="http://localhost:4200/health" target="_blank" rel="noopener noreferrer" className="hover:text-purple-600 underline">API Health</a>
      </div>
    </div>
  );
}

function ServiceCard({ service, allServices, isRecovering, recoveryResult, onRecover }: {
  service: ServiceHealth; allServices: ServiceHealth[];
  isRecovering: boolean; recoveryResult?: RecoveryEntry; onRecover: () => void;
}) {
  const unhealthyDeps = service.dependencies
    .map(depId => allServices.find(s => s.id === depId))
    .filter(dep => dep && !dep.healthy);

  const displayStatus = isRecovering ? 'RECOVERING' : service.status;

  return (
    <div className={`bg-white rounded-xl border p-4 ${!service.healthy && !isRecovering ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span>{categoryIcons[service.category]}</span>
          <h3 className="font-semibold text-sm text-gray-900">{service.name}</h3>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColors[displayStatus] || statusColors.UNKNOWN}`}>
          {statusIcons[displayStatus] || '⚪'} {displayStatus}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">Port</span>
          <span className="font-mono text-gray-700">{service.port}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Protocol</span>
          <span className="font-medium text-gray-700">{protocolLabels[service.protocol] || service.protocol}</span>
        </div>
        {service.endpoint && (
          <div className="flex justify-between">
            <span className="text-gray-500">Endpoint</span>
            <span className="font-mono text-gray-700 text-[10px]">{service.endpoint}</span>
          </div>
        )}
        {service.responseMs !== undefined && service.healthy && (
          <div className="flex justify-between">
            <span className="text-gray-500">Response</span>
            <span className="font-medium text-gray-700">{service.responseMs}ms</span>
          </div>
        )}
        {service.responseMs !== undefined && service.healthy && (
          <div className="flex justify-between">
            <span className="text-gray-500">Performance</span>
            <span className={`font-medium ${classifyPerformance(service.responseMs).color}`}>{classifyPerformance(service.responseMs).label}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-500">Last checked</span>
          <span className="text-gray-600">{new Date(service.lastChecked).toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Dependencies */}
      {service.dependencies.length > 0 && (
        <div className="mt-3 pt-2 border-t">
          <p className="text-[10px] text-gray-500 mb-1">Dependencies:</p>
          <div className="flex flex-wrap gap-1">
            {service.dependencies.map(depId => {
              const dep = allServices.find(s => s.id === depId);
              return (
                <span key={depId} className={`text-[10px] px-1.5 py-0.5 rounded ${dep?.healthy ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {dep?.healthy ? '✓' : '✗'} {dep?.name || depId}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Error + Remediation */}
      {service.lastError && !isRecovering && (
        <div className="mt-2 bg-red-50 rounded p-2 space-y-1">
          <p className="text-[10px] font-medium text-red-700">Why:</p>
          <p className="text-[10px] text-red-600">{service.lastError}</p>
          <p className="text-[10px] font-medium text-red-700 mt-1">Impact:</p>
          <p className="text-[10px] text-red-600">{service.affectedFeatures.length > 0 ? service.affectedFeatures.join(', ') : 'Dependent services may be affected'}</p>
          <p className="text-[10px] font-medium text-red-700 mt-1">How to resolve:</p>
          <p className="text-[10px] text-red-600">{service.recoverable ? 'Click Recover below, or manually restart the service' : (service.recoveryMechanism || 'Check service process and configuration')}</p>
        </div>
      )}

      {/* Unhealthy dependency */}
      {unhealthyDeps.length > 0 && service.healthy && (
        <div className="mt-2 bg-yellow-50 rounded p-2">
          <p className="text-[10px] text-yellow-700">Dependency degraded: {unhealthyDeps.map(d => d!.name).join(', ')}</p>
        </div>
      )}

      {/* Recovery result */}
      {recoveryResult && (
        <div className={`mt-2 rounded p-2 ${recoveryResult.status === 'success' ? 'bg-green-50' : 'bg-red-50'}`}>
          <p className={`text-[10px] font-medium ${recoveryResult.status === 'success' ? 'text-green-700' : 'text-red-700'}`}>
            {recoveryResult.status === 'success' ? `✓ Recovery successful (${((recoveryResult.durationMs || 0) / 1000).toFixed(1)}s)` : `✗ Recovery failed: ${recoveryResult.error}`}
          </p>
        </div>
      )}

      {/* Recovering indicator */}
      {isRecovering && (
        <div className="mt-2 bg-blue-50 rounded p-2">
          <p className="text-[10px] text-blue-700 font-medium animate-pulse">🔄 Recovering... Restarting service and verifying health...</p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 pt-2 border-t flex items-center gap-2 flex-wrap">
        {/* Recover button — only when unhealthy and recoverable */}
        {!service.healthy && service.recoverable && !isRecovering && (
          <button onClick={onRecover} className="text-[10px] font-semibold text-white bg-orange-500 hover:bg-orange-600 px-2.5 py-1 rounded transition">
            ⚡ Recover
          </button>
        )}
        {/* Manual recovery hint */}
        {!service.healthy && !service.recoverable && service.recoveryMechanism && (
          <span className="text-[10px] text-gray-500 italic">{service.recoveryMechanism}</span>
        )}
        {/* Open button for HTTP services */}
        {service.actions.includes('open') && service.endpoint && service.protocol === 'http' && (
          <a href={service.endpoint} target="_blank" rel="noopener noreferrer" className="text-[10px] text-purple-600 hover:text-purple-800 font-medium">
            Open →
          </a>
        )}
      </div>
    </div>
  );
}
