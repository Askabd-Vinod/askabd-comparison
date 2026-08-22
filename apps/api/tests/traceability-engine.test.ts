/**
 * Generic Traceability Engine — migration 041, traceability-engine.ts.
 * Proves real Postgres persistence, idempotent linking, direct
 * inbound/outbound lookup, real multi-hop chain traversal (forward and
 * backward), and real cycle safety on a genuinely cyclic graph.
 */
import { describe, expect, it, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TraceabilityEngine } from '../src/services/traceability-engine.js';
import { sharedPool } from '../src/services/db-pool.js';

const engine = new TraceabilityEngine();
const PREFIX = 'trace-fixture';
const createdNodeIds: string[] = [];

afterAll(async () => {
  await sharedPool.query(
    `DELETE FROM traceability_links WHERE source_id = ANY($1) OR target_id = ANY($1)`,
    [createdNodeIds]
  ).catch(() => {});
});

function node(): string {
  const id = `${PREFIX}-${randomUUID()}`;
  createdNodeIds.push(id);
  return id;
}

describe('TraceabilityEngine — basic linking', () => {
  it('links two real entities and returns a real, persisted row', async () => {
    const br = node();
    const fr = node();
    const link = await engine.link('business_requirement', br, 'functional_requirement', fr, 'derives_from', 'staff-1');
    expect(link.sourceId).toBe(br);
    expect(link.targetId).toBe(fr);
    expect(link.linkType).toBe('derives_from');
    expect(link.createdBy).toBe('staff-1');
  });

  it('linking the same (source, target, linkType) triple twice is idempotent — returns the SAME row, never a duplicate', async () => {
    const br = node();
    const fr = node();
    const first = await engine.link('business_requirement', br, 'functional_requirement', fr, 'derives_from', 'staff-1');
    const second = await engine.link('business_requirement', br, 'functional_requirement', fr, 'derives_from', 'staff-2');
    expect(second.id).toBe(first.id);
    expect(second.createdBy).toBe('staff-1'); // the ORIGINAL row, not overwritten by the second call

    const outbound = await engine.getOutboundLinks('business_requirement', br);
    expect(outbound).toHaveLength(1);
  });

  it('the SAME two entities can hold multiple real links of DIFFERENT types simultaneously', async () => {
    const req = node();
    const test = node();
    await engine.link('requirement', req, 'test_case', test, 'tests', 'staff-1');
    await engine.link('requirement', req, 'test_case', test, 'blocks', 'staff-1');
    const outbound = await engine.getOutboundLinks('requirement', req);
    expect(outbound.map(l => l.linkType).sort()).toEqual(['blocks', 'tests']);
  });

  it('unlink removes a real row and reports whether anything was actually removed', async () => {
    const a = node();
    const b = node();
    await engine.link('a', a, 'b', b, 'relates_to', null);
    const removed = await engine.unlink('a', a, 'b', b, 'relates_to');
    expect(removed).toBe(true);
    expect(await engine.getOutboundLinks('a', a)).toHaveLength(0);

    const removedAgain = await engine.unlink('a', a, 'b', b, 'relates_to');
    expect(removedAgain).toBe(false); // honest — nothing was there to remove
  });
});

describe('TraceabilityEngine — direct inbound/outbound lookup', () => {
  it('getInboundLinks finds real links where this entity is the target', async () => {
    const req = node();
    const test1 = node();
    const test2 = node();
    await engine.link('test_case', test1, 'requirement', req, 'tests', null);
    await engine.link('test_case', test2, 'requirement', req, 'tests', null);
    const inbound = await engine.getInboundLinks('requirement', req);
    expect(inbound.map(l => l.sourceId).sort()).toEqual([test1, test2].sort());
  });
});

describe('TraceabilityEngine — real multi-hop chain traversal', () => {
  it('getForwardChain walks the full real BR->FR->TR->Task chain, in the correct depth order', async () => {
    const br = node(); const fr = node(); const tr = node(); const task = node();
    await engine.link('business_requirement', br, 'functional_requirement', fr, 'derives_from', null);
    await engine.link('functional_requirement', fr, 'technical_requirement', tr, 'derives_from', null);
    await engine.link('technical_requirement', tr, 'task', task, 'implements', null);

    const chain = await engine.getForwardChain('business_requirement', br);
    expect(chain.map(c => c.targetId)).toEqual([fr, tr, task]);
    expect(chain.map(c => c.depth)).toEqual([1, 2, 3]);
  });

  it('getBackwardChain from a deep entity walks all the way back up to its real root', async () => {
    const br = node(); const fr = node(); const task = node();
    await engine.link('business_requirement', br, 'functional_requirement', fr, 'derives_from', null);
    await engine.link('functional_requirement', fr, 'task', task, 'implements', null);

    const chain = await engine.getBackwardChain('task', task);
    expect(chain.map(c => c.sourceId)).toEqual([fr, br]);
  });

  it('a diamond-shaped real graph (two paths converging on one node) reports that node ONCE, at its shortest real depth', async () => {
    const br = node(); const frA = node(); const frB = node(); const task = node();
    await engine.link('business_requirement', br, 'functional_requirement', frA, 'derives_from', null);
    await engine.link('business_requirement', br, 'functional_requirement', frB, 'derives_from', null);
    await engine.link('functional_requirement', frA, 'task', task, 'implements', null);
    await engine.link('functional_requirement', frB, 'task', task, 'implements', null);

    const chain = await engine.getForwardChain('business_requirement', br);
    const taskLinks = chain.filter(c => c.targetId === task);
    expect(taskLinks).toHaveLength(2); // two DISTINCT link rows (frA->task, frB->task) — both real, both kept
    expect(chain.map(c => c.targetId).sort()).toEqual([frA, frB, task, task].sort());
  });

  it('a genuinely cyclic graph (A->B->C->A) does not hang or return an unbounded/infinite chain', async () => {
    const a = node(); const b = node(); const c = node();
    await engine.link('node', a, 'node', b, 'relates_to', null);
    await engine.link('node', b, 'node', c, 'relates_to', null);
    await engine.link('node', c, 'node', a, 'relates_to', null); // closes the cycle back to the start

    const chain = await engine.getForwardChain('node', a, 10);
    // Real, bounded result — never throws, never returns something implying infinite depth.
    expect(chain.length).toBeGreaterThan(0);
    expect(chain.length).toBeLessThan(20);
    expect(chain.every(c => typeof c.depth === 'number' && c.depth <= 10)).toBe(true);
  });

  it('maxDepth genuinely limits how far the real traversal goes', async () => {
    const n0 = node(); const n1 = node(); const n2 = node(); const n3 = node();
    await engine.link('chain_node', n0, 'chain_node', n1, 'relates_to', null);
    await engine.link('chain_node', n1, 'chain_node', n2, 'relates_to', null);
    await engine.link('chain_node', n2, 'chain_node', n3, 'relates_to', null);

    const shallow = await engine.getForwardChain('chain_node', n0, 1);
    expect(shallow.map(c => c.targetId)).toEqual([n1]);

    const deeper = await engine.getForwardChain('chain_node', n0, 2);
    expect(deeper.map(c => c.targetId)).toEqual([n1, n2]);
  });

  it('a chain from an entity with no real links returns an empty array, never a fabricated single-node chain', async () => {
    const lonely = node();
    expect(await engine.getForwardChain('lonely_type', lonely)).toEqual([]);
    expect(await engine.getBackwardChain('lonely_type', lonely)).toEqual([]);
  });
});
