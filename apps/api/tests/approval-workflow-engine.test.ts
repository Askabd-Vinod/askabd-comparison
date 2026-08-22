/**
 * Generic Approval Workflow Engine — migration 040, approval-workflow-engine.ts.
 * Proves real Postgres persistence, the real enforced state machine, the
 * one-open-workflow-per-entity DB constraint, and the automatic
 * approved -> superseded transition when a new workflow opens.
 */
import { describe, expect, it, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ApprovalWorkflowEngine, InvalidTransitionError } from '../src/services/approval-workflow-engine.js';
import { sharedPool } from '../src/services/db-pool.js';

const ENTITY_TYPE = 'test_fixture_approval_entity';
const cleanupEntityIds: string[] = [];

afterAll(async () => {
  for (const id of cleanupEntityIds) {
    await sharedPool.query('DELETE FROM approval_workflows WHERE entity_type = $1 AND entity_id = $2', [ENTITY_TYPE, id]).catch(() => {});
  }
});

function freshEntityId(): string {
  const id = `fixture-${randomUUID()}`;
  cleanupEntityIds.push(id);
  return id;
}

describe('ApprovalWorkflowEngine — basic lifecycle', () => {
  it('opens a real workflow in draft status with a real, logged first step', async () => {
    const engine = new ApprovalWorkflowEngine();
    const entityId = freshEntityId();
    const wf = await engine.openWorkflow(ENTITY_TYPE, entityId, 'Approve new pricing tier', { proposedPrice: 499 }, 'staff-1');
    expect(wf.status).toBe('draft');
    expect(wf.context).toEqual({ proposedPrice: 499 });

    const steps = await engine.getSteps(wf.id);
    expect(steps).toHaveLength(1);
    expect(steps[0].fromStatus).toBeNull();
    expect(steps[0].toStatus).toBe('draft');
  });

  it('the full happy path: draft -> in_review -> approved, with real decision attribution', async () => {
    const engine = new ApprovalWorkflowEngine();
    const entityId = freshEntityId();
    const wf = await engine.openWorkflow(ENTITY_TYPE, entityId, 'Approve document', {}, 'staff-1');
    const submitted = await engine.submit(wf.id, 'staff-1');
    expect(submitted.status).toBe('in_review');
    expect(submitted.submittedBy).toBe('staff-1');
    expect(submitted.submittedAt).not.toBeNull();

    const approved = await engine.approve(wf.id, 'staff-manager-1', 'Looks good, ship it.');
    expect(approved.status).toBe('approved');
    expect(approved.decidedBy).toBe('staff-manager-1');
    expect(approved.decisionNote).toBe('Looks good, ship it.');
    expect(approved.decidedAt).not.toBeNull();

    const steps = await engine.getSteps(wf.id);
    expect(steps.map(s => s.toStatus)).toEqual(['draft', 'in_review', 'approved']);
  });

  it('rejection is a real, attributed terminal state', async () => {
    const engine = new ApprovalWorkflowEngine();
    const entityId = freshEntityId();
    const wf = await engine.openWorkflow(ENTITY_TYPE, entityId, 'Approve risky change', {}, 'staff-1');
    await engine.submit(wf.id, 'staff-1');
    const rejected = await engine.reject(wf.id, 'staff-manager-1', 'Too risky without a rollback plan.');
    expect(rejected.status).toBe('rejected');
    expect(rejected.decisionNote).toBe('Too risky without a rollback plan.');
  });

  it('changes-requested loop: in_review -> changes_requested -> in_review -> approved', async () => {
    const engine = new ApprovalWorkflowEngine();
    const entityId = freshEntityId();
    const wf = await engine.openWorkflow(ENTITY_TYPE, entityId, 'Approve draft doc', {}, 'staff-1');
    await engine.submit(wf.id, 'staff-1');
    const changesRequested = await engine.requestChanges(wf.id, 'staff-manager-1', 'Please add a rollback section.');
    expect(changesRequested.status).toBe('changes_requested');

    const resubmitted = await engine.resubmit(wf.id, 'staff-1');
    expect(resubmitted.status).toBe('in_review');

    const approved = await engine.approve(wf.id, 'staff-manager-1');
    expect(approved.status).toBe('approved');

    const steps = await engine.getSteps(wf.id);
    expect(steps.map(s => s.toStatus)).toEqual(['draft', 'in_review', 'changes_requested', 'in_review', 'approved']);
  });

  it('requestChanges without a note is rejected — never a silent bounce-back', async () => {
    const engine = new ApprovalWorkflowEngine();
    const entityId = freshEntityId();
    const wf = await engine.openWorkflow(ENTITY_TYPE, entityId, 'Approve doc', {}, 'staff-1');
    await engine.submit(wf.id, 'staff-1');
    await expect(engine.requestChanges(wf.id, 'staff-manager-1', '   ')).rejects.toThrow(/note explaining/i);
  });
});

describe('ApprovalWorkflowEngine — the real, enforced state machine', () => {
  it('approving directly from draft (skipping in_review) is rejected with a clear, real error', async () => {
    const engine = new ApprovalWorkflowEngine();
    const entityId = freshEntityId();
    const wf = await engine.openWorkflow(ENTITY_TYPE, entityId, 'Approve doc', {}, 'staff-1');
    await expect(engine.approve(wf.id, 'staff-manager-1')).rejects.toThrow(InvalidTransitionError);
  });

  it('transitioning out of a terminal state (rejected) is rejected', async () => {
    const engine = new ApprovalWorkflowEngine();
    const entityId = freshEntityId();
    const wf = await engine.openWorkflow(ENTITY_TYPE, entityId, 'Approve doc', {}, 'staff-1');
    await engine.submit(wf.id, 'staff-1');
    await engine.reject(wf.id, 'staff-manager-1');
    await expect(engine.submit(wf.id, 'staff-1')).rejects.toThrow(InvalidTransitionError);
  });
});

describe('ApprovalWorkflowEngine — one-open-workflow-per-entity (real DB constraint)', () => {
  it('opening a second workflow while one is still in_review is rejected by the real unique constraint', async () => {
    const engine = new ApprovalWorkflowEngine();
    const entityId = freshEntityId();
    const wf1 = await engine.openWorkflow(ENTITY_TYPE, entityId, 'First workflow', {}, 'staff-1');
    await engine.submit(wf1.id, 'staff-1');
    await expect(engine.openWorkflow(ENTITY_TYPE, entityId, 'Second, competing workflow', {}, 'staff-1')).rejects.toThrow();
  });

  it('opening a new workflow after the entity\'s previous one was approved automatically supersedes the old one', async () => {
    const engine = new ApprovalWorkflowEngine();
    const entityId = freshEntityId();
    const wf1 = await engine.openWorkflow(ENTITY_TYPE, entityId, 'v1 approval', {}, 'staff-1');
    await engine.submit(wf1.id, 'staff-1');
    await engine.approve(wf1.id, 'staff-manager-1');

    const wf2 = await engine.openWorkflow(ENTITY_TYPE, entityId, 'v2 approval', {}, 'staff-1');
    expect(wf2.status).toBe('draft');

    const oldWorkflow = await engine.getWorkflow(wf1.id);
    expect(oldWorkflow?.status).toBe('superseded');

    const supersededSteps = await engine.getSteps(wf1.id);
    expect(supersededSteps[supersededSteps.length - 1].toStatus).toBe('superseded');
  });

  it('getOpenForEntity returns the real current open workflow, null when none exists', async () => {
    const engine = new ApprovalWorkflowEngine();
    const entityId = freshEntityId();
    expect(await engine.getOpenForEntity(ENTITY_TYPE, entityId)).toBeNull();

    const wf = await engine.openWorkflow(ENTITY_TYPE, entityId, 'Open one', {}, 'staff-1');
    const open = await engine.getOpenForEntity(ENTITY_TYPE, entityId);
    expect(open?.id).toBe(wf.id);

    await engine.submit(wf.id, 'staff-1');
    await engine.approve(wf.id, 'staff-manager-1');
    expect(await engine.getOpenForEntity(ENTITY_TYPE, entityId)).toBeNull(); // approved is terminal-ish (only -> superseded), not "open"
  });

  it('listForEntity returns every real workflow ever opened for an entity, newest first', async () => {
    const engine = new ApprovalWorkflowEngine();
    const entityId = freshEntityId();
    const wf1 = await engine.openWorkflow(ENTITY_TYPE, entityId, 'first', {}, 'staff-1');
    await engine.submit(wf1.id, 'staff-1');
    await engine.approve(wf1.id, 'staff-manager-1');
    const wf2 = await engine.openWorkflow(ENTITY_TYPE, entityId, 'second', {}, 'staff-1');

    const all = await engine.listForEntity(ENTITY_TYPE, entityId);
    expect(all.map(w => w.id)).toEqual([wf2.id, wf1.id]);
  });
});
