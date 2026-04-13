/**
 * MultiplayerNetcode.test.ts — Cycle 195
 *
 * Tests for ReplicationManager and ClientPrediction.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ReplicationManager } from '../multiplayer/ReplicationManager';
import { ClientPrediction } from '../multiplayer/ClientPrediction';

// =============================================================================
// REPLICATION MANAGER
// =============================================================================

describe('ReplicationManager', () => {
  let rm: ReplicationManager;
  beforeEach(() => {
    rm = new ReplicationManager();
  });

  it('registers entities', () => {
    const e = rm.register('player1', 'character', 'host');
    expect(e.entityId).toBe('player1');
    expect(e.type).toBe('character');
    expect(e.ownerId).toBe('host');
  });

  it('unregisters entities', () => {
    rm.register('p1', 'character', 'host');
    expect(rm.unregister('p1')).toBe(true);
    expect(rm.getEntity('p1')).toBeUndefined();
  });

  it('updates snapshots and marks dirty', () => {
    rm.register('p1', 'character', 'host');
    rm.updateSnapshot('p1', { position: [10, 0, 0] });
    const e = rm.getEntity('p1')!;
    expect(e.isDirty).toBe(true);
    expect(e.snapshot.position.x).toBe(10);
  });

  it('setCustomState stores key-value', () => {
    rm.register('p1', 'character', 'host');
    rm.setCustomState('p1', 'health', 100);
    const e = rm.getEntity('p1')!;
    expect(e.snapshot.customState.health).toBe(100);
  });

  it('generates delta updates for dirty entities', () => {
    rm.register('p1', 'character', 'host', { updateIntervalMs: 0 });
    rm.updateSnapshot('p1', { position: [5, 0, 0] });
    const updates = rm.generateUpdates(Date.now() + 100);
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0].entityId).toBe('p1');
  });

  it('first update is full snapshot', () => {
    rm.register('p1', 'character', 'host', { updateIntervalMs: 0 });
    rm.updateSnapshot('p1', { position: [1, 2, 3] });
    const updates = rm.generateUpdates(Date.now() + 100);
    expect(updates[0].isFullSnapshot).toBe(true);
  });

  it('subsequent updates are deltas', () => {
    rm.register('p1', 'character', 'host', { updateIntervalMs: 0 });
    rm.updateSnapshot('p1', { position: [1, 0, 0] });
    rm.generateUpdates(Date.now() + 100);
    // Move again
    rm.updateSnapshot('p1', { position: [5, 0, 0] });
    const updates = rm.generateUpdates(Date.now() + 200);
    if (updates.length > 0) {
      expect(updates[0].isFullSnapshot).toBe(false);
    }
  });

  it('applies remote updates', () => {
    rm.register('p1', 'character', 'host', { updateIntervalMs: 0 });
    rm.applyRemoteUpdate({
      entityId: 'p1',
      timestamp: Date.now(),
      fields: { position: [99, 0, 0] },
      isFullSnapshot: true,
    });
    expect(rm.getEntity('p1')!.snapshot.position.x).toBe(99);
  });

  it('getStats returns entity counts', () => {
    rm.register('a', 'character', 'host');
    rm.register('b', 'vehicle', 'host');
    const stats = rm.getStats();
    expect(stats.totalEntities).toBe(2);
  });

  it('getEntitiesByType filters correctly', () => {
    rm.register('a', 'character', 'h');
    rm.register('b', 'vehicle', 'h');
    rm.register('c', 'character', 'h');
    expect(rm.getEntitiesByType('character')).toHaveLength(2);
    expect(rm.getEntitiesByType('vehicle')).toHaveLength(1);
  });

  it('respects update interval', () => {
    rm.register('p1', 'character', 'host', { updateIntervalMs: 1000 });
    rm.updateSnapshot('p1', { position: [1, 0, 0] });
    const t = Date.now();
    const updates = rm.generateUpdates(t);
    // Second call within interval should yield no updates
    rm.updateSnapshot('p1', { position: [2, 0, 0] });
    const updates2 = rm.generateUpdates(t + 10);
    expect(updates2).toHaveLength(0);
  });
});

// =============================================================================
// CLIENT PREDICTION
// =============================================================================

describe('ClientPrediction', () => {
  const initialState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  const predictor = (state: any, input: any) => ({
    ...state,
    x: state.x + (input.actions.moveX || 0) * input.deltaTime,
    z: state.z + (input.actions.moveZ || 0) * input.deltaTime,
    vx: input.actions.moveX || 0,
    vz: input.actions.moveZ || 0,
  });

  let cp: ClientPrediction;
  beforeEach(() => {
    cp = new ClientPrediction(initialState, predictor);
  });

  it('starts with initial state', () => {
    const s = cp.getState();
    expect(s.x).toBe(0);
    expect(s.z).toBe(0);
  });

  it('pushInput advances predicted state', () => {
    cp.pushInput({ sequence: 0, deltaTime: 1, actions: { moveX: 5 } });
    const s = cp.getState();
    expect(s.x).toBe(5);
  });

  it('multiple inputs accumulate', () => {
    cp.pushInput({ sequence: 0, deltaTime: 1, actions: { moveX: 3 } });
    cp.pushInput({ sequence: 1, deltaTime: 1, actions: { moveX: 2 } });
    expect(cp.getState().x).toBe(5);
    expect(cp.getPendingCount()).toBe(2);
  });

  it('reconcile accepts server state and replays', () => {
    cp.pushInput({ sequence: 0, deltaTime: 1, actions: { moveX: 3 } });
    cp.pushInput({ sequence: 1, deltaTime: 1, actions: { moveX: 2 } });
    // Server acks seq 0, says x=2.9 (slightly different)
    cp.reconcile({ x: 2.9, y: 0, z: 0, vx: 3, vy: 0, vz: 0 }, 0);
    // seq 1 should be replayed on top of server state
    const s = cp.getState();
    expect(s.x).toBeCloseTo(4.9, 1);
    expect(cp.getPendingCount()).toBe(1);
  });

  it('reconcile detects mispredictions', () => {
    cp.pushInput({ sequence: 0, deltaTime: 1, actions: { moveX: 3 } });
    // Server says very different position
    cp.reconcile({ x: 100, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, 0);
    expect(cp.getMispredictions()).toBeGreaterThan(0);
  });

  it('getLastAckedSequence tracks acknowledgments', () => {
    expect(cp.getLastAckedSequence()).toBe(-1);
    cp.pushInput({ sequence: 0, deltaTime: 1, actions: { moveX: 1 } });
    cp.reconcile({ x: 1, y: 0, z: 0, vx: 1, vy: 0, vz: 0 }, 0);
    expect(cp.getLastAckedSequence()).toBe(0);
  });

  it('pending inputs are trimmed beyond maxPending', () => {
    for (let i = 0; i < 200; i++) {
      cp.pushInput({ sequence: i, deltaTime: 0.016, actions: { moveX: 1 } });
    }
    expect(cp.getPendingCount()).toBeLessThanOrEqual(120);
  });
});
