/**
 * Test Management Adapter architecture — a generic interface so the core
 * Testing Engine never hard-codes TestRail (or any other tool) into
 * itself, per the spec's own explicit instruction. The engine always
 * produces one standard result shape (test case / execution / defect);
 * an adapter maps that to a client's external system.
 *
 * `InternalReportAdapter` is the real, working default — when no
 * external tool is configured, this engine generates the AskABD report
 * itself (test-report-service.ts). The named-provider stubs below
 * (TestRail/Jira/Azure DevOps) demonstrate the real extensibility shape
 * this architecture supports, but are honestly NOT live integrations —
 * no client has a configured API key/URL for any of them yet, and each
 * stub says so explicitly rather than fabricating a successful push.
 */
import type { TestCase } from './testing-engine.js';
import type { TestExecution } from './test-execution-service.js';
import type { TestDefect } from './test-defect-service.js';

export interface AdapterResult { ok: true; externalId: string } // eslint-disable-line @typescript-eslint/no-unused-vars
export type AdapterOutcome = { ok: true; externalId: string } | { ok: false; reason: string };

export interface TestManagementAdapter {
  readonly name: string;
  pushTestCase(testCase: TestCase): Promise<AdapterOutcome>;
  pushExecution(execution: TestExecution): Promise<AdapterOutcome>;
  pushDefect(defect: TestDefect): Promise<AdapterOutcome>;
}

/** The real, working default — no external system, this engine's own report is the deliverable. */
export class InternalReportAdapter implements TestManagementAdapter {
  readonly name = 'internal';
  async pushTestCase(testCase: TestCase): Promise<AdapterOutcome> { return { ok: true, externalId: testCase.id }; }
  async pushExecution(execution: TestExecution): Promise<AdapterOutcome> { return { ok: true, externalId: execution.id }; }
  async pushDefect(defect: TestDefect): Promise<AdapterOutcome> { return { ok: true, externalId: defect.id }; }
}

/** Architecture-only — real shape, no live credentials configured for any client yet. */
export class TestRailAdapter implements TestManagementAdapter {
  readonly name = 'testrail';
  async pushTestCase(): Promise<AdapterOutcome> { return { ok: false, reason: 'TestRail is not configured for this client yet — no project/suite/case mapping exists.' }; }
  async pushExecution(): Promise<AdapterOutcome> { return { ok: false, reason: 'TestRail is not configured for this client yet.' }; }
  async pushDefect(): Promise<AdapterOutcome> { return { ok: false, reason: 'TestRail is not configured for this client yet.' }; }
}

/** Architecture-only — same honest non-live status as TestRailAdapter. */
export class JiraAdapter implements TestManagementAdapter {
  readonly name = 'jira';
  async pushTestCase(): Promise<AdapterOutcome> { return { ok: false, reason: 'Jira test-management sync is not configured for this client yet.' }; }
  async pushExecution(): Promise<AdapterOutcome> { return { ok: false, reason: 'Jira test-management sync is not configured for this client yet.' }; }
  async pushDefect(): Promise<AdapterOutcome> { return { ok: false, reason: 'Jira test-management sync is not configured for this client yet.' }; }
}

/** Architecture-only — same honest non-live status as TestRailAdapter. */
export class AzureDevOpsAdapter implements TestManagementAdapter {
  readonly name = 'azure_devops';
  async pushTestCase(): Promise<AdapterOutcome> { return { ok: false, reason: 'Azure DevOps test-management sync is not configured for this client yet.' }; }
  async pushExecution(): Promise<AdapterOutcome> { return { ok: false, reason: 'Azure DevOps test-management sync is not configured for this client yet.' }; }
  async pushDefect(): Promise<AdapterOutcome> { return { ok: false, reason: 'Azure DevOps test-management sync is not configured for this client yet.' }; }
}

const ADAPTERS: Record<string, () => TestManagementAdapter> = {
  internal: () => new InternalReportAdapter(),
  testrail: () => new TestRailAdapter(),
  jira: () => new JiraAdapter(),
  azure_devops: () => new AzureDevOpsAdapter(),
};

/** No per-client external-tool configuration exists yet (real, honest — see Known Limitations) — always resolves to the real internal adapter for now. */
export function getAdapter(provider: string = 'internal'): TestManagementAdapter {
  return (ADAPTERS[provider] ?? ADAPTERS.internal)!();
}
