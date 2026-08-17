'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Action } from '../../../components/button';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface JiraConfig {
  baseUrl: string;
  projectKey: string;
  authMethod: string;
  authEmail: string;
  authToken: string;
  defaultIssueType: string;
  defaultPriority: string;
  status: string;
  lastHealthCheck: string | null;
  lastHealthStatus: string;
  lastHealthError: string;
}

interface HealthResult {
  status: string;
  responseMs?: number;
  projectAccessible?: boolean;
  error?: string;
  lastChecked: string;
}

export default function JiraIntegrationPage() {
  const [config, setConfig] = useState<JiraConfig | null>(null);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Form state
  const [baseUrl, setBaseUrl] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [defaultIssueType, setDefaultIssueType] = useState('Task');
  const [defaultPriority, setDefaultPriority] = useState('Medium');

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/oc/jira/config?environment=development`);
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
        setBaseUrl(data.config.baseUrl || '');
        setProjectKey(data.config.projectKey || '');
        setAuthEmail(data.config.authEmail || '');
        setDefaultIssueType(data.config.defaultIssueType || 'Task');
        setDefaultPriority(data.config.defaultPriority || 'Medium');
      }
    } catch { /* Jira not configured yet */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API}/api/v1/oc/jira/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environment: 'development',
          baseUrl, projectKey, authMethod: 'api_token',
          authEmail, authToken: authToken || undefined,
          defaultIssueType, defaultPriority,
        }),
      });
      if (res.ok) {
        setMessage('Configuration saved successfully.');
        await loadConfig();
      } else {
        const err = await res.json();
        setMessage(`Save failed: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      setMessage(`Save failed: ${(err as Error).message}`);
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setHealth(null);
    setMessage('');
    try {
      const res = await fetch(`${API}/api/v1/oc/jira/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment: 'development' }),
      });
      const data = await res.json();
      setHealth(data);
      if (data.status === 'healthy') setMessage('Jira connection healthy ✓');
      else setMessage(`Jira: ${data.status}${data.error ? ' — ' + data.error : ''}`);
    } catch (err) {
      setMessage(`Test failed: ${(err as Error).message}`);
    }
    setTesting(false);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'healthy': return 'bg-green-100 text-green-800';
      case 'authenticated': return 'bg-blue-100 text-blue-800';
      case 'configured': return 'bg-yellow-100 text-yellow-800';
      case 'degraded': return 'bg-orange-100 text-orange-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) return <div className="p-8 text-gray-500">Loading Jira configuration...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jira Integration</h1>
          <p className="text-sm text-gray-500 mt-1">Connect AskABD to Jira for issue tracking and remediation management.</p>
        </div>
        <Link href="/platform" className="text-sm text-purple-600 hover:underline">← Platform</Link>
      </div>

      {/* Status Banner */}
      <div className="rounded-lg border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor(config?.status || 'not_configured')}`}>
            {(config?.status || 'NOT CONFIGURED').toUpperCase().replace('_', ' ')}
          </span>
          <span className="text-sm text-gray-600">
            Environment: <strong>Development</strong>
          </span>
          {config?.lastHealthCheck && (
            <span className="text-xs text-gray-400">
              Last checked: {new Date(config.lastHealthCheck).toLocaleString()}
            </span>
          )}
        </div>
        <Action variant="secondary" onClick={handleTest} disabled={!config?.baseUrl} loading={testing}>
          Test Connection
        </Action>
      </div>

      {/* Health Result */}
      {health && (
        <div className={`rounded-lg border p-4 ${health.status === 'healthy' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium">{health.status === 'healthy' ? '✓ Connected' : '✗ ' + health.status}</span>
            {health.responseMs && <span className="text-gray-500">Response: {health.responseMs}ms</span>}
            {health.projectAccessible !== undefined && <span className="text-gray-500">Project: {health.projectAccessible ? '✓ Accessible' : '✗ Not accessible'}</span>}
            {health.error && <span className="text-red-600">{health.error}</span>}
          </div>
        </div>
      )}

      {/* Message */}
      {message && (
        <div className={`p-3 rounded text-sm ${message.includes('✓') || message.includes('success') ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
          {message}
        </div>
      )}

      {/* Configuration Form */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Configuration</h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="jira-base-url" className="block text-sm font-medium text-gray-700 mb-1">Jira URL<span className="text-red-500 ml-0.5" aria-label="required">*</span></label>
            <input id="jira-base-url" type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://company.atlassian.net" aria-describedby="jira-base-url-help"
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-purple-500 focus:border-purple-500" />
            <p className="text-xs text-gray-400 mt-1" id="jira-base-url-help">Your Jira Cloud instance URL</p>
          </div>
          <div>
            <label htmlFor="jira-project-key" className="block text-sm font-medium text-gray-700 mb-1">Project Key<span className="text-red-500 ml-0.5" aria-label="required">*</span></label>
            <input id="jira-project-key" type="text" value={projectKey} onChange={e => setProjectKey(e.target.value)}
              placeholder="ABD" aria-describedby="jira-project-key-help"
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-purple-500 focus:border-purple-500" />
            <p className="text-xs text-gray-400 mt-1" id="jira-project-key-help">Jira project key for issue creation</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="jira-auth-email" className="block text-sm font-medium text-gray-700 mb-1">Auth Email<span className="text-gray-400 ml-1 font-normal text-xs">(optional)</span></label>
            <input id="jira-auth-email" type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)}
              placeholder="user@company.com"
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-purple-500 focus:border-purple-500" />
          </div>
          <div>
            <label htmlFor="jira-auth-token" className="block text-sm font-medium text-gray-700 mb-1">API Token<span className="text-gray-400 ml-1 font-normal text-xs">(optional)</span></label>
            <input id="jira-auth-token" type="password" value={authToken} onChange={e => setAuthToken(e.target.value)}
              placeholder={config?.authToken ? '••••••••' : 'Enter Jira API token'} aria-describedby="jira-auth-token-help"
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-purple-500 focus:border-purple-500" />
            <p className="text-xs text-gray-400 mt-1" id="jira-auth-token-help">Never displayed after save. Generate at id.atlassian.com.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Issue Type</label>
            <select value={defaultIssueType} onChange={e => setDefaultIssueType(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm">
              <option>Task</option>
              <option>Bug</option>
              <option>Story</option>
              <option>Epic</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Priority</label>
            <select value={defaultPriority} onChange={e => setDefaultPriority(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm">
              <option>Highest</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
              <option>Lowest</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Action variant="primary" onClick={handleSave} disabled={!baseUrl || !projectKey} loading={saving} className="!bg-purple-600 hover:!bg-purple-700">
            Save Configuration
          </Action>
        </div>
      </div>

      {/* Info */}
      <div className="rounded-lg bg-gray-50 border p-4 text-sm text-gray-600 space-y-2">
        <p><strong>How Jira Integration Works:</strong></p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>AskABD identifies problems through discovery, assessment, and monitoring.</li>
          <li>Issues can be created in Jira for tracking and remediation.</li>
          <li>Deduplication prevents duplicate Jira issues for the same finding.</li>
          <li>When Jira marks an issue Done, AskABD re-verifies using real evidence.</li>
          <li>Tokens are never returned by the API or shown in the UI after configuration. In this development environment they are not yet encrypted at rest — production deployments require secure secret storage before real credentials are entered here.</li>
        </ul>
      </div>
    </div>
  );
}
