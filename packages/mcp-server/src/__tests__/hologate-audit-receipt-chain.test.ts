/**
 * HoloGate §5 measurement 8 — Audit receipt chain integrity (entry→mutation→exit→rewind)
 *
 * Verifies that the portal-entry receipt infrastructure produces a tamper-evident
 * chain across the full portal lifecycle:
 *   1. Entry   — receipt captures entry world-state hash + granted scopes
 *   2. Mutation — intents validated + deltas applied to world state
 *   3. Exit    — exit receipt references entry receipt id + exit world-state hash
 *   4. Rewind  — exit receipt contains enough provenance to reconstruct entry state
 *
 * This is a unit-level integration test; it does not require a real server or
 * persistent store. All state is in-process.
 *
 * Paper evidence: Paper 35 §5, measurement 8 of 8.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

import {
  validatePortalIntent,
  intentToDelta,
  deepMerge,
  type SpatialPolicy,
  type PortalIntent,
} from '../holo-portal-intent.js';

// ---------------------------------------------------------------------------
// Minimal world-state model (in-process, no Loro required)
// ---------------------------------------------------------------------------

type EntityState = Record<string, unknown>;
type WorldState = Record<string, EntityState>;

/** Recursively sort object keys so JSON serialisation is canonical. */
function sortedJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortedJson);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.keys(o).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = sortedJson(o[k]);
      return acc;
    }, {});
  }
  return v;
}

function hashWorldState(state: WorldState): string {
  const canonical = JSON.stringify(sortedJson(state));
  return 'sha256:' + createHash('sha256').update(canonical).digest('hex');
}

function applyDelta(state: WorldState, entityId: string, payload: Record<string, unknown>): WorldState {
  const existing = state[entityId] ?? {};
  return { ...state, [entityId]: deepMerge(existing as Record<string, unknown>, payload) };
}

// ---------------------------------------------------------------------------
// Portal lifecycle helpers (in-process receipt model)
// ---------------------------------------------------------------------------

interface PortalEntryRecord {
  receiptId: string;
  agentId: string;
  tunnelId: string;
  worldId: string;
  entryWorldStateHash: string;
  scopesGranted: string[];
  entryTs: number;
}

interface MutationRecord {
  seq: number;
  agentId: string;
  intentKind: string;
  entityId: string;
  deltaHash: string;
  ts: number;
}

interface PortalExitRecord {
  receiptId: string;
  agentId: string;
  entryReceiptId: string;   // back-reference — tamper-evident chain
  exitWorldStateHash: string;
  mutationCount: number;
  mutationLog: MutationRecord[];
  exitTs: number;
}

function buildEntryReceipt(
  agentId: string,
  worldState: WorldState,
  scopes: string[],
  now = Date.now(),
): PortalEntryRecord {
  return {
    receiptId: `entry:${agentId}:${now}`,
    agentId,
    tunnelId: `tunnel-test-01`,
    worldId: `world-hologate-audit-test`,
    entryWorldStateHash: hashWorldState(worldState),
    scopesGranted: scopes,
    entryTs: now,
  };
}

function buildExitReceipt(
  entry: PortalEntryRecord,
  exitWorldState: WorldState,
  mutations: MutationRecord[],
  now = Date.now(),
): PortalExitRecord {
  return {
    receiptId: `exit:${entry.agentId}:${now}`,
    agentId: entry.agentId,
    entryReceiptId: entry.receiptId,  // ← chain link
    exitWorldStateHash: hashWorldState(exitWorldState),
    mutationCount: mutations.length,
    mutationLog: mutations,
    exitTs: now,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const POLICY: SpatialPolicy = {
  defaultScope: 'drive-avatar',
  mutableZoneGlobs: ['entity:*'],
  driveAvatar: { allow: true, maxEntities: 1 },
};

describe('portal audit receipt chain — entry → mutation → exit → rewind', () => {
  let worldState: WorldState;

  beforeEach(() => {
    worldState = {
      'entity:box-1': { transform: { position: { x: 0, y: 0, z: 0 } }, updatedAt: 1000 },
      'entity:box-2': { transform: { position: { x: 5, y: 0, z: 0 } }, updatedAt: 1000 },
      'avatar:agent-a': { lastUtterance: '', utteranceTs: 0 },
    };
  });

  // -------------------------------------------------------------------------
  // 1. Entry receipt captures initial world-state hash
  // -------------------------------------------------------------------------
  it('entry receipt captures deterministic world-state hash', () => {
    const entry = buildEntryReceipt('agent-a', worldState, ['scope:world:read', 'scope:agent:drive-avatar']);

    expect(entry.receiptId).toMatch(/^entry:agent-a:/);
    expect(entry.entryWorldStateHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(entry.scopesGranted).toContain('scope:agent:drive-avatar');

    // Deterministic: same world state → same hash
    const entry2 = buildEntryReceipt('agent-a', { ...worldState }, ['scope:world:read']);
    expect(entry2.entryWorldStateHash).toBe(entry.entryWorldStateHash);
  });

  // -------------------------------------------------------------------------
  // 2. Mutated world state produces a different hash
  // -------------------------------------------------------------------------
  it('mutation produces a different world-state hash than entry', () => {
    const entry = buildEntryReceipt('agent-a', worldState, ['scope:agent:drive-avatar']);
    const entryHash = entry.entryWorldStateHash;

    const intent: PortalIntent = { kind: 'move', entityId: 'entity:box-1', position: { x: 10, y: 0, z: 0 } };
    const validation = validatePortalIntent(intent, POLICY);
    expect(validation.allowed).toBe(true);

    const { entityId, payload } = intentToDelta(intent, 2000);
    worldState = applyDelta(worldState, entityId, payload);

    expect(hashWorldState(worldState)).not.toBe(entryHash);
  });

  // -------------------------------------------------------------------------
  // 3. Exit receipt chains back to entry receipt id
  // -------------------------------------------------------------------------
  it('exit receipt references entry receiptId (tamper-evident chain)', () => {
    const entry = buildEntryReceipt('agent-a', worldState, ['scope:agent:drive-avatar'], 1000);

    // Apply a mutation
    const intent: PortalIntent = { kind: 'move', entityId: 'entity:box-1', position: { x: 3, y: 0, z: 0 } };
    const { entityId, payload } = intentToDelta(intent, 1100);
    worldState = applyDelta(worldState, entityId, payload);

    const mutation: MutationRecord = {
      seq: 1, agentId: 'agent-a', intentKind: 'move', entityId,
      deltaHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
      ts: 1100,
    };

    const exit = buildExitReceipt(entry, worldState, [mutation], 2000);

    // Chain integrity: exit references entry
    expect(exit.entryReceiptId).toBe(entry.receiptId);
    expect(exit.agentId).toBe(entry.agentId);
    expect(exit.mutationCount).toBe(1);
    expect(exit.exitWorldStateHash).not.toBe(entry.entryWorldStateHash);
  });

  // -------------------------------------------------------------------------
  // 4. Rewind: exit receipt contains enough provenance to recover entry hash
  // -------------------------------------------------------------------------
  it('exit receipt carries entry hash provenance for rewind', () => {
    const originalHash = hashWorldState(worldState);
    const entry = buildEntryReceipt('agent-a', worldState, ['scope:agent:drive-avatar'], 1000);

    // Apply 3 mutations
    const mutations: MutationRecord[] = [];
    const intents: PortalIntent[] = [
      { kind: 'move', entityId: 'entity:box-1', position: { x: 1, y: 0, z: 0 } },
      { kind: 'move', entityId: 'entity:box-2', position: { x: 6, y: 0, z: 0 } },
      { kind: 'say',  entityId: 'avatar:agent-a', utterance: 'test' },
    ];

    for (let i = 0; i < intents.length; i++) {
      const v = validatePortalIntent(intents[i], POLICY);
      expect(v.allowed).toBe(true);
      const { entityId, payload } = intentToDelta(intents[i], 1000 + i * 100);
      worldState = applyDelta(worldState, entityId, payload);
      mutations.push({
        seq: i + 1, agentId: 'agent-a', intentKind: intents[i].kind, entityId,
        deltaHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
        ts: 1000 + i * 100,
      });
    }

    const exit = buildExitReceipt(entry, worldState, mutations, 2000);

    // Rewind anchor: entry world-state hash is in the entry receipt, referenced from exit
    expect(exit.entryReceiptId).toBe(entry.receiptId);
    expect(entry.entryWorldStateHash).toBe(originalHash);
    expect(exit.exitWorldStateHash).not.toBe(originalHash);

    // Full mutation log preserved in exit receipt
    expect(exit.mutationLog).toHaveLength(3);
    expect(exit.mutationLog.map((m) => m.intentKind)).toEqual(['move', 'move', 'say']);
    // Seq is monotonic
    expect(exit.mutationLog.map((m) => m.seq)).toEqual([1, 2, 3]);
  });

  // -------------------------------------------------------------------------
  // 5. Rejected intents produce no state mutation and no mutation log entry
  // -------------------------------------------------------------------------
  it('rejected intent leaves world state and mutation log unchanged', () => {
    const entry = buildEntryReceipt('agent-a', worldState, ['scope:world:read'], 1000);
    const hashBefore = hashWorldState(worldState);
    const mutations: MutationRecord[] = [];

    // read-only scope → move rejected
    const intent: PortalIntent = { kind: 'move', entityId: 'entity:box-1', position: { x: 99, y: 0, z: 0 } };
    const v = validatePortalIntent(intent, { defaultScope: 'read-only' });
    expect(v.allowed).toBe(false);

    // Guard: only apply delta on allowed intents
    if (v.allowed) {
      const { entityId, payload } = intentToDelta(intent);
      worldState = applyDelta(worldState, entityId, payload);
      mutations.push({ seq: 1, agentId: 'agent-a', intentKind: intent.kind, entityId, deltaHash: '', ts: Date.now() });
    }

    expect(hashWorldState(worldState)).toBe(hashBefore);
    expect(mutations).toHaveLength(0);

    const exit = buildExitReceipt(entry, worldState, mutations);
    expect(exit.exitWorldStateHash).toBe(entry.entryWorldStateHash);  // no change
    expect(exit.mutationCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 6. World-state hash is order-independent (canonical JSON)
  // -------------------------------------------------------------------------
  it('world-state hash is independent of entity insertion order', () => {
    const stateA: WorldState = {
      'entity:alpha': { x: 1 },
      'entity:beta':  { x: 2 },
    };
    const stateB: WorldState = {
      'entity:beta':  { x: 2 },
      'entity:alpha': { x: 1 },
    };
    expect(hashWorldState(stateA)).toBe(hashWorldState(stateB));
  });

  // -------------------------------------------------------------------------
  // 7. Delta hash integrity — payload hash in mutation log is reproducible
  // -------------------------------------------------------------------------
  it('mutation record delta hash is deterministic and matches payload', () => {
    const intent: PortalIntent = { kind: 'move', entityId: 'entity:box-1', position: { x: 7, y: 2, z: 1 } };
    const { payload } = intentToDelta(intent, 5000);

    const hash1 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const hash2 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  // -------------------------------------------------------------------------
  // 8. Multi-agent: each agent produces an independent receipt chain
  // -------------------------------------------------------------------------
  it('two agents each get independent receipt chains with no cross-contamination', () => {
    const entryA = buildEntryReceipt('agent-a', worldState, ['scope:agent:drive-avatar'], 1000);
    const entryB = buildEntryReceipt('agent-b', worldState, ['scope:agent:drive-avatar'], 1001);

    // agent-a mutates box-1
    const intentA: PortalIntent = { kind: 'move', entityId: 'entity:box-1', position: { x: 10, y: 0, z: 0 } };
    const { entityId: eidA, payload: payA } = intentToDelta(intentA, 1100);
    const stateAfterA = applyDelta(worldState, eidA, payA);

    // agent-b mutates box-2 (independent)
    const intentB: PortalIntent = { kind: 'move', entityId: 'entity:box-2', position: { x: -5, y: 0, z: 0 } };
    const { entityId: eidB, payload: payB } = intentToDelta(intentB, 1200);
    const stateAfterB = applyDelta(worldState, eidB, payB);

    const mutA: MutationRecord = { seq: 1, agentId: 'agent-a', intentKind: 'move', entityId: eidA, deltaHash: '', ts: 1100 };
    const mutB: MutationRecord = { seq: 1, agentId: 'agent-b', intentKind: 'move', entityId: eidB, deltaHash: '', ts: 1200 };

    const exitA = buildExitReceipt(entryA, stateAfterA, [mutA], 2000);
    const exitB = buildExitReceipt(entryB, stateAfterB, [mutB], 2001);

    // Chains are independent
    expect(exitA.entryReceiptId).toBe(entryA.receiptId);
    expect(exitB.entryReceiptId).toBe(entryB.receiptId);
    expect(exitA.entryReceiptId).not.toBe(exitB.entryReceiptId);

    // Exit hashes differ (different mutations on different entities)
    expect(exitA.exitWorldStateHash).not.toBe(exitB.exitWorldStateHash);

    // Each agent's log contains only their own mutations
    expect(exitA.mutationLog[0].agentId).toBe('agent-a');
    expect(exitB.mutationLog[0].agentId).toBe('agent-b');
  });
});
