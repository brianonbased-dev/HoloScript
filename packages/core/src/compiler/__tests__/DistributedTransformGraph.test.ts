/**
 * DistributedTransformGraph — Tests (paper-8 §5 CRDT extension)
 *
 * Test groups:
 *   A. computeMergedHash — commutativity + single/empty node
 *   B. advanceLamportClock — Lamport semantics
 *   C. localCompose — state update, clock advance, stateHash
 *   D. receiveRemoteState — clock merge, node registration
 *   E. getActiveNodes / getStaleNodes — staleness window
 *   F. getMergedHash — deterministic across permutations
 *   G. mergeActiveNodes — distributed composition
 *   H. end-to-end two-node gossip scenario
 */

import { describe, it, expect } from 'vitest';
import {
  computeMergedHash,
  advanceLamportClock,
  hashNodeState,
  DistributedTransformGraph,
  type NodeTransformState,
} from '../traits/DistributedTransformGraph';
import { ProvenanceSemiring } from '../traits/ProvenanceSemiring';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<NodeTransformState> = {}): NodeTransformState {
  return {
    nodeId: 'node-a',
    logicalClock: 1,
    wallClockMs: Date.now(),
    stateHash: 'abc12345',
    provenanceConfig: {},
    errors: [],
    ...overrides,
  };
}

// ── A. computeMergedHash ──────────────────────────────────────────────────────

describe('A. computeMergedHash', () => {
  it('returns 00000000 for empty state list', () => {
    expect(computeMergedHash([])).toBe('00000000');
  });

  it('returns stable hash for single state', () => {
    const s = makeState({ nodeId: 'alpha' });
    const h1 = computeMergedHash([s]);
    const h2 = computeMergedHash([s]);
    expect(h1).toBe(h2);
  });

  it('is commutative: same result regardless of array order', () => {
    const s1 = makeState({ nodeId: 'alpha', stateHash: 'hash1' });
    const s2 = makeState({ nodeId: 'beta', stateHash: 'hash2' });
    const s3 = makeState({ nodeId: 'gamma', stateHash: 'hash3' });
    const h1 = computeMergedHash([s1, s2, s3]);
    const h2 = computeMergedHash([s3, s1, s2]);
    const h3 = computeMergedHash([s2, s3, s1]);
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
  });

  it('different stateHashes produce different merged hashes', () => {
    const s1 = makeState({ nodeId: 'alpha', stateHash: 'hash-x' });
    const s2 = makeState({ nodeId: 'alpha', stateHash: 'hash-y' });
    expect(computeMergedHash([s1])).not.toBe(computeMergedHash([s2]));
  });

  it('output is always 8 hex chars', () => {
    const s = makeState();
    const h = computeMergedHash([s]);
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ── B. advanceLamportClock ────────────────────────────────────────────────────

describe('B. advanceLamportClock', () => {
  it('is max(local, remote) + 1', () => {
    expect(advanceLamportClock(3, 7)).toBe(8);
    expect(advanceLamportClock(7, 3)).toBe(8);
    expect(advanceLamportClock(5, 5)).toBe(6);
  });

  it('advances even when local is higher', () => {
    expect(advanceLamportClock(10, 2)).toBe(11);
  });
});

// ── C. localCompose ───────────────────────────────────────────────────────────

describe('C. localCompose', () => {
  it('advances the logical clock by 1', () => {
    const g = new DistributedTransformGraph({ nodeId: 'n1' });
    expect(g.getClock()).toBe(0);
    g.localCompose([{ name: 'test', config: { mass: 1 } }]);
    expect(g.getClock()).toBe(1);
    g.localCompose([{ name: 'test', config: { mass: 2 } }]);
    expect(g.getClock()).toBe(2);
  });

  it('records local node state after compose', () => {
    const g = new DistributedTransformGraph({ nodeId: 'n1' });
    g.localCompose([{ name: 'trait-a', config: { mass: 1 } }]);
    const state = g.exportLocalState();
    expect(state).toBeDefined();
    expect(state?.nodeId).toBe('n1');
    expect(state?.logicalClock).toBe(1);
    expect(state?.stateHash).toBeTruthy();
  });

  it('stateHash changes when compose input changes', () => {
    const g = new DistributedTransformGraph({ nodeId: 'n1' });
    g.localCompose([{ name: 'trait-a', config: { mass: 1 } }]);
    const h1 = g.exportLocalState()?.stateHash;
    g.localCompose([{ name: 'trait-b', config: { mass: 99 } }]);
    const h2 = g.exportLocalState()?.stateHash;
    expect(h1).not.toBe(h2);
  });

  it('empty trait array produces a valid composition', () => {
    const g = new DistributedTransformGraph({ nodeId: 'n1' });
    const result = g.localCompose([]);
    expect(result.errors).toHaveLength(0);
    expect(result.config).toEqual({});
  });
});

// ── D. receiveRemoteState ─────────────────────────────────────────────────────

describe('D. receiveRemoteState', () => {
  it('registers the remote node', () => {
    const g = new DistributedTransformGraph({ nodeId: 'local' });
    expect(g.knownNodeCount()).toBe(0);
    g.receiveRemoteState(makeState({ nodeId: 'remote' }));
    expect(g.knownNodeCount()).toBe(1);
  });

  it('advances local Lamport clock when remote is higher', () => {
    const g = new DistributedTransformGraph({ nodeId: 'local' });
    g.localCompose([{ name: 't', config: {} }]); // clock = 1
    g.receiveRemoteState(makeState({ nodeId: 'remote', logicalClock: 10 }));
    expect(g.getClock()).toBe(11); // max(1, 10) + 1
  });

  it('does not decrease clock when remote is lower', () => {
    const g = new DistributedTransformGraph({ nodeId: 'local' });
    // advance to 5
    for (let i = 0; i < 5; i++) g.localCompose([{ name: 't', config: {} }]);
    expect(g.getClock()).toBe(5);
    g.receiveRemoteState(makeState({ nodeId: 'remote', logicalClock: 2 }));
    expect(g.getClock()).toBe(6); // max(5, 2) + 1
  });

  it('receiving same node twice overwrites its state', () => {
    const g = new DistributedTransformGraph({ nodeId: 'local' });
    g.receiveRemoteState(makeState({ nodeId: 'peer', logicalClock: 1, stateHash: 'old' }));
    g.receiveRemoteState(makeState({ nodeId: 'peer', logicalClock: 5, stateHash: 'new' }));
    expect(g.knownNodeCount()).toBe(1); // still 1 unique peer
  });
});

// ── E. getActiveNodes / getStaleNodes ────────────────────────────────────────

describe('E. getActiveNodes / getStaleNodes', () => {
  it('fresh node is active', () => {
    const g = new DistributedTransformGraph({ nodeId: 'local', maxStalenessMs: 5000 });
    g.localCompose([{ name: 't', config: {} }]);
    const active = g.getActiveNodes();
    expect(active).toContain('local');
  });

  it('stale node (old wallClock) is excluded from active', () => {
    const g = new DistributedTransformGraph({ nodeId: 'local', maxStalenessMs: 5000 });
    const oldState = makeState({ nodeId: 'old-peer', wallClockMs: Date.now() - 10_000 });
    g.receiveRemoteState(oldState);
    const active = g.getActiveNodes();
    expect(active).not.toContain('old-peer');
    const stale = g.getStaleNodes();
    expect(stale).toContain('old-peer');
  });

  it('getStalenessMs returns 0 for unknown node', () => {
    const g = new DistributedTransformGraph({ nodeId: 'local' });
    expect(g.getStalenessMs('unknown')).toBe(0);
  });

  it('getStalenessMs returns correct age', () => {
    const g = new DistributedTransformGraph({ nodeId: 'local', maxStalenessMs: 5000 });
    const age = 3_000;
    g.receiveRemoteState(makeState({ nodeId: 'peer', wallClockMs: Date.now() - age }));
    const measured = g.getStalenessMs('peer');
    expect(measured).toBeGreaterThanOrEqual(age);
    expect(measured).toBeLessThan(age + 200); // allow for test execution time
  });
});

// ── F. getMergedHash ─────────────────────────────────────────────────────────

describe('F. getMergedHash', () => {
  it('returns 00000000 when no active nodes', () => {
    const g = new DistributedTransformGraph({ nodeId: 'local', maxStalenessMs: 5000 });
    // No local compose done yet → no state stored
    expect(g.getMergedHash()).toBe('00000000');
  });

  it('changes when a new node joins', () => {
    const g = new DistributedTransformGraph({ nodeId: 'local', maxStalenessMs: 5000 });
    g.localCompose([{ name: 't', config: { v: 1 } }]);
    const h1 = g.getMergedHash();
    g.receiveRemoteState(makeState({ nodeId: 'peer', stateHash: 'peer-hash' }));
    const h2 = g.getMergedHash();
    expect(h1).not.toBe(h2);
  });

  it('is the same on two nodes that have exchanged states', () => {
    const now = Date.now();
    const stateA: NodeTransformState = makeState({ nodeId: 'A', stateHash: 'sa', wallClockMs: now });
    const stateB: NodeTransformState = makeState({ nodeId: 'B', stateHash: 'sb', wallClockMs: now });

    // Node A knows A and B
    const gA = new DistributedTransformGraph({ nodeId: 'A' });
    gA.receiveRemoteState(stateA); // self
    gA.receiveRemoteState(stateB);

    // Node B knows A and B
    const gB = new DistributedTransformGraph({ nodeId: 'B' });
    gB.receiveRemoteState(stateA);
    gB.receiveRemoteState(stateB); // self

    expect(gA.getMergedHash(now)).toBe(gB.getMergedHash(now));
  });
});

// ── G. mergeActiveNodes ───────────────────────────────────────────────────────

describe('G. mergeActiveNodes', () => {
  it('returns empty composition when no nodes', () => {
    const g = new DistributedTransformGraph({ nodeId: 'local' });
    const result = g.mergeActiveNodes();
    expect(result.composition.config).toEqual({});
    expect(result.activeNodeIds).toHaveLength(0);
  });

  it('mergedHash in result matches getMergedHash()', () => {
    const g = new DistributedTransformGraph({ nodeId: 'local', maxStalenessMs: 5000 });
    g.localCompose([{ name: 'physics', config: { mass: 5 } }]);
    const result = g.mergeActiveNodes();
    expect(result.mergedHash).toBe(g.getMergedHash());
  });

  it('activeNodeIds contains local after localCompose', () => {
    const g = new DistributedTransformGraph({ nodeId: 'local', maxStalenessMs: 5000 });
    g.localCompose([{ name: 't', config: {} }]);
    const result = g.mergeActiveNodes();
    expect(result.activeNodeIds).toContain('local');
  });

  it('stale nodes appear in staleNodeIds', () => {
    const g = new DistributedTransformGraph({ nodeId: 'local', maxStalenessMs: 5000 });
    g.receiveRemoteState(makeState({ nodeId: 'stale', wallClockMs: Date.now() - 10_000 }));
    const result = g.mergeActiveNodes();
    expect(result.staleNodeIds).toContain('stale');
  });

  it('logicalClock in result matches getClock()', () => {
    const g = new DistributedTransformGraph({ nodeId: 'local' });
    g.localCompose([{ name: 't', config: {} }]);
    const result = g.mergeActiveNodes();
    expect(result.logicalClock).toBe(g.getClock());
  });
});

// ── H. End-to-end two-node gossip scenario ────────────────────────────────────

describe('H. end-to-end two-node gossip', () => {
  it('two nodes converge to same mergedHash after exchanging states', () => {
    const now = Date.now();

    // Node A composes locally
    const gA = new DistributedTransformGraph({ nodeId: 'A', maxStalenessMs: 30_000 });
    gA.localCompose([{ name: 'physics', config: { mass: 10, restitution: 0.5 } }]);

    // Node B composes locally
    const gB = new DistributedTransformGraph({ nodeId: 'B', maxStalenessMs: 30_000 });
    gB.localCompose([{ name: 'material', config: { color: 'red' } }]);

    // Exchange states (gossip)
    const stateA = gA.exportLocalState()!;
    const stateB = gB.exportLocalState()!;
    gA.receiveRemoteState(stateB);
    gB.receiveRemoteState(stateA);

    // Both should compute the same merged hash
    expect(gA.getMergedHash(now + 1000)).toBe(gB.getMergedHash(now + 1000));
  });

  it('Lamport clock advances correctly during gossip round', () => {
    const gA = new DistributedTransformGraph({ nodeId: 'A' });
    const gB = new DistributedTransformGraph({ nodeId: 'B' });

    gA.localCompose([{ name: 't', config: {} }]); // A clock = 1
    gA.localCompose([{ name: 't', config: {} }]); // A clock = 2
    gB.localCompose([{ name: 't', config: {} }]); // B clock = 1

    // B receives A's state (clock=2) → B clock becomes max(1,2)+1 = 3
    gB.receiveRemoteState(gA.exportLocalState()!);
    expect(gB.getClock()).toBe(3);

    // A receives B's new state (clock=3) → A clock becomes max(2,3)+1 = 4
    // But B's state was set when clock=3, so let's get updated state
    // B needs to export after receiving A
    gB.localCompose([{ name: 'u', config: {} }]); // B clock = 4
    gA.receiveRemoteState(gB.exportLocalState()!);
    expect(gA.getClock()).toBe(5); // max(2,4)+1
  });

  it('mergeActiveNodes output contains expected property from remote node', () => {
    const semiring = new ProvenanceSemiring();
    const gA = new DistributedTransformGraph({ nodeId: 'A', maxStalenessMs: 30_000, semiring });
    const gB = new DistributedTransformGraph({ nodeId: 'B', maxStalenessMs: 30_000, semiring });

    gA.localCompose([{ name: 'physics', config: { mass: 10 } }]);
    gB.localCompose([{ name: 'material', config: { opacity: 0.8 } }]);

    // Full gossip exchange
    gA.receiveRemoteState(gB.exportLocalState()!);
    gB.receiveRemoteState(gA.exportLocalState()!);

    const resultA = gA.mergeActiveNodes();
    const resultB = gB.mergeActiveNodes();

    // Both should include both properties
    expect(resultA.composition.config).toHaveProperty('mass');
    expect(resultA.composition.config).toHaveProperty('opacity');
    expect(resultB.composition.config).toHaveProperty('mass');
    expect(resultB.composition.config).toHaveProperty('opacity');
  });
});
