/**
 * multiplayer-sync.scenario.ts — LIVING-SPEC: Multiplayer Sync
 *
 * Persona: Riku — multiplayer game developer implementing
 * real-time state synchronization with delta compression.
 *
 * ✓ it(...)      = PASSING — feature exists
 */

import { describe, it, expect } from 'vitest';
import {
  deltaCompress, deltaApply,
  entityInterpolate,
  conflictResolve,
  snapshotDiff,
  bandwidthEstimate,
  networkQuality,
  type Snapshot, type EntityState,
} from '@/lib/networkSync';

// ═══════════════════════════════════════════════════════════════════
// Test Data Factory
// ═══════════════════════════════════════════════════════════════════

function makeEntity(id: string, x: number, y: number, z: number, owner = 'player-1'): EntityState {
  return {
    id,
    position: { x, y, z },
    rotation: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    health: 100,
    owner,
    timestamp: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Delta Compression
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Multiplayer — Delta Compression', () => {
  it('deltaCompress() detects position changes', () => {
    const prev: Snapshot = { tick: 0, timestamp: 0, entities: [makeEntity('e1', 0, 0, 0)] };
    const curr: Snapshot = { tick: 1, timestamp: 100, entities: [makeEntity('e1', 5, 0, 0)] };
    const delta = deltaCompress(prev, curr);
    expect(delta.changes).toHaveLength(1);
    expect(delta.changes[0].position!.x).toBe(5);
    expect(delta.changes[0].rotation).toBeUndefined(); // Unchanged
  });

  it('deltaCompress() detects added entities', () => {
    const prev: Snapshot = { tick: 0, timestamp: 0, entities: [makeEntity('e1', 0, 0, 0)] };
    const curr: Snapshot = { tick: 1, timestamp: 100, entities: [makeEntity('e1', 0, 0, 0), makeEntity('e2', 10, 0, 0)] };
    const delta = deltaCompress(prev, curr);
    expect(delta.addedEntities).toHaveLength(1);
    expect(delta.addedEntities[0].id).toBe('e2');
  });

  it('deltaCompress() detects removed entities', () => {
    const prev: Snapshot = { tick: 0, timestamp: 0, entities: [makeEntity('e1', 0, 0, 0), makeEntity('e2', 5, 0, 0)] };
    const curr: Snapshot = { tick: 1, timestamp: 100, entities: [makeEntity('e1', 0, 0, 0)] };
    const delta = deltaCompress(prev, curr);
    expect(delta.removedIds).toContain('e2');
  });

  it('deltaCompress() produces zero changes for identical snapshots', () => {
    const snap: Snapshot = { tick: 0, timestamp: 0, entities: [makeEntity('e1', 0, 0, 0)] };
    const delta = deltaCompress(snap, snap);
    expect(delta.changes).toHaveLength(0);
    expect(delta.addedEntities).toHaveLength(0);
    expect(delta.removedIds).toHaveLength(0);
  });

  it('deltaCompress() sizeBytes is smaller than full snapshot', () => {
    const prev: Snapshot = { tick: 0, timestamp: 0, entities: Array.from({ length: 100 }, (_, i) => makeEntity(`e${i}`, i, 0, 0)) };
    const curr: Snapshot = { tick: 1, timestamp: 100, entities: prev.entities.map((e, i) => i < 5 ? { ...e, position: { x: e.position.x + 1, y: 0, z: 0 } } : e) };
    const delta = deltaCompress(prev, curr);
    expect(delta.changes).toHaveLength(5); // Only 5 changed
    expect(delta.sizeBytes).toBeLessThan(100 * 96); // Much less than full snapshot
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Delta Application
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Multiplayer — Delta Application', () => {
  it('deltaApply() applies position changes', () => {
    const base: Snapshot = { tick: 0, timestamp: 0, entities: [makeEntity('e1', 0, 0, 0)] };
    const curr: Snapshot = { tick: 1, timestamp: 100, entities: [makeEntity('e1', 10, 5, 3)] };
    const delta = deltaCompress(base, curr);
    const result = deltaApply(base, delta);
    expect(result.entities[0].position.x).toBe(10);
    expect(result.entities[0].position.y).toBe(5);
    expect(result.tick).toBe(1);
  });

  it('deltaApply() adds new entities', () => {
    const base: Snapshot = { tick: 0, timestamp: 0, entities: [makeEntity('e1', 0, 0, 0)] };
    const curr: Snapshot = { tick: 1, timestamp: 100, entities: [makeEntity('e1', 0, 0, 0), makeEntity('e2', 5, 5, 5)] };
    const delta = deltaCompress(base, curr);
    const result = deltaApply(base, delta);
    expect(result.entities).toHaveLength(2);
  });

  it('deltaApply() removes deleted entities', () => {
    const base: Snapshot = { tick: 0, timestamp: 0, entities: [makeEntity('e1', 0, 0, 0), makeEntity('e2', 5, 0, 0)] };
    const curr: Snapshot = { tick: 1, timestamp: 100, entities: [makeEntity('e1', 0, 0, 0)] };
    const delta = deltaCompress(base, curr);
    const result = deltaApply(base, delta);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].id).toBe('e1');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Entity Interpolation
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Multiplayer — Entity Interpolation', () => {
  const from = makeEntity('e1', 0, 0, 0);
  const to = makeEntity('e1', 10, 20, 30);

  it('entityInterpolate() at t=0 returns from state', () => {
    const frame = entityInterpolate(from, to, 0);
    expect(frame.entity.position.x).toBe(0);
    expect(frame.progress).toBe(0);
  });

  it('entityInterpolate() at t=1 returns to state', () => {
    const frame = entityInterpolate(from, to, 1);
    expect(frame.entity.position.x).toBe(10);
    expect(frame.entity.position.y).toBe(20);
  });

  it('entityInterpolate() at t=0.5 returns midpoint', () => {
    const frame = entityInterpolate(from, to, 0.5);
    expect(frame.entity.position.x).toBeCloseTo(5);
    expect(frame.entity.position.y).toBeCloseTo(10);
    expect(frame.progress).toBe(0.5);
  });

  it('entityInterpolate() clamps t to [0, 1]', () => {
    const over = entityInterpolate(from, to, 2.0);
    expect(over.progress).toBe(1);
    const under = entityInterpolate(from, to, -1);
    expect(under.progress).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Conflict Resolution
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Multiplayer — Conflict Resolution', () => {
  const server = makeEntity('e1', 10, 0, 0);
  const client = makeEntity('e1', 15, 0, 0);

  it('server-wins uses server state', () => {
    const result = conflictResolve(server, client, 'server-wins');
    expect(result.resolved.position.x).toBe(10);
  });

  it('client-wins uses client state', () => {
    const result = conflictResolve(server, client, 'client-wins');
    expect(result.resolved.position.x).toBe(15);
  });

  it('merge blends position from client, health from server', () => {
    const result = conflictResolve(
      { ...server, health: 50 },
      { ...client, health: 80 },
      'merge'
    );
    expect(result.resolved.position.x).toBe(15); // Client position
    expect(result.resolved.health).toBe(50);       // Server health
  });

  it('latest-timestamp picks newer state', () => {
    const older = { ...server, timestamp: 1000 };
    const newer = { ...client, timestamp: 2000 };
    const result = conflictResolve(older, newer, 'latest-timestamp');
    expect(result.resolved.position.x).toBe(15); // Newer (client)
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Snapshot Diff & Bandwidth
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Multiplayer — Snapshot Diff & Bandwidth', () => {
  it('snapshotDiff() categorizes entity changes', () => {
    const a: Snapshot = { tick: 0, timestamp: 0, entities: [makeEntity('e1', 0, 0, 0), makeEntity('e2', 5, 0, 0)] };
    const b: Snapshot = { tick: 1, timestamp: 100, entities: [makeEntity('e1', 1, 0, 0), makeEntity('e3', 10, 0, 0)] };
    const diff = snapshotDiff(a, b);
    expect(diff.changed).toContain('e1');
    expect(diff.removed).toContain('e2');
    expect(diff.added).toContain('e3');
  });

  it('bandwidthEstimate() calculates bytes/sec', () => {
    const metrics = bandwidthEstimate(100, 20, 0.3);
    expect(metrics.bytesPerSecond).toBeGreaterThan(0);
    expect(metrics.packetsPerSecond).toBe(20);
    expect(metrics.compressionRatio).toBeLessThan(1); // Delta < full
  });

  it('networkQuality() classifies RTT', () => {
    expect(networkQuality(15)).toBe('excellent');
    expect(networkQuality(50)).toBe('good');
    expect(networkQuality(120)).toBe('fair');
    expect(networkQuality(300)).toBe('poor');
    expect(networkQuality(1000)).toBe('disconnected');
  });
});
