import { describe, it, expect } from 'vitest';
import { EntityAuthority } from '../multiplayer/EntityAuthority';
import { NetworkInterpolation } from '../multiplayer/NetworkInterpolation';
import { ReplicationManager } from '../multiplayer/ReplicationManager';

describe('Cycle 108: Multiplayer Scene Sync', () => {
  // -------------------------------------------------------------------------
  // EntityAuthority
  // -------------------------------------------------------------------------

  it('should register entities and track ownership', () => {
    const auth = new EntityAuthority('player1');

    auth.register('cube', 'player1');
    auth.register('sphere', 'player2', { transferable: true });

    expect(auth.isLocalOwner('cube')).toBe(true);
    expect(auth.isLocalOwner('sphere')).toBe(false);
    expect(auth.getOwner('sphere')).toBe('player2');
    expect(auth.getOwnedEntities('player1')).toContain('cube');
  });

  it('should handle authority transfer requests', () => {
    const auth = new EntityAuthority('player1');
    auth.register('npc', 'player2', { transferable: true });

    const request = auth.requestTransfer('npc', 'interaction');
    expect(request).not.toBeNull();
    expect(request!.status).toBe('pending');

    auth.approveTransfer(request!.id);
    expect(auth.getOwner('npc')).toBe('player1');
    expect(auth.isLocalOwner('npc')).toBe(true);
  });

  it('should respect entity locks', () => {
    const auth = new EntityAuthority('player1');
    auth.register('locked_obj', 'player2');

    auth.lockEntity('locked_obj', 10000); // Lock for 10s
    const request = auth.requestTransfer('locked_obj');
    expect(request).toBeNull(); // Can't transfer locked entity

    auth.unlockEntity('locked_obj');
    expect(auth.isLocked('locked_obj')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // NetworkInterpolation
  // -------------------------------------------------------------------------

  it('should interpolate between snapshots', () => {
    const interp = new NetworkInterpolation({ bufferTimeMs: 100 });

    // Push two snapshots 100ms apart
    interp.pushSnapshot({
      entityId: 'e1',
      timestamp: 0,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    });
    interp.pushSnapshot({
      entityId: 'e1',
      timestamp: 100,
      position: { x: 10, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    });

    // At render time 150 (minus 100 buffer = t=50), should be at x=5
    const state = interp.getInterpolatedState('e1', 150);
    expect(state).not.toBeNull();
    expect(state!.position.x).toBeCloseTo(5, 0);
    expect(state!.isExtrapolating).toBe(false);
  });

  it('should extrapolate with velocity when no future snapshot', () => {
    const interp = new NetworkInterpolation({ bufferTimeMs: 50, maxExtrapolationMs: 500 });

    interp.pushSnapshot({
      entityId: 'e2',
      timestamp: 0,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 10, y: 0, z: 0 }, // Moving 10 units/sec
    });

    // At render time 550 (buffer=50 → t=500), extrapolate: 0 + 10 * 0.5 = 5
    const state = interp.getInterpolatedState('e2', 550);
    expect(state).not.toBeNull();
    expect(state!.position.x).toBeCloseTo(5, 0);
    expect(state!.isExtrapolating).toBe(true);
  });

  it('should smooth-correct local position toward server', () => {
    const interp = new NetworkInterpolation({ snapThreshold: 10, lerpSpeed: 10 });

    const corrected = interp.smoothCorrection(
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      0.05 // dt (lerpSpeed * dt = 10 * 0.05 = 0.5, partial blend)
    );

    // Should move toward server pos but not snap (dist < threshold)
    expect(corrected.x).toBeGreaterThan(0);
    expect(corrected.x).toBeLessThan(2);
  });

  // -------------------------------------------------------------------------
  // ReplicationManager
  // -------------------------------------------------------------------------

  it('should register and generate delta updates', () => {
    const mgr = new ReplicationManager();

    mgr.register('car1', 'vehicle', 'player1', { priority: 8, updateIntervalMs: 0 });
    mgr.updateSnapshot('car1', {
      position: { x: 10, y: 0, z: 5 },
      velocity: { x: 1, y: 0, z: 0 },
    });

    const updates = mgr.generateUpdates(999999);
    expect(updates.length).toBe(1);
    expect(updates[0].isFullSnapshot).toBe(true); // First update is always full
    expect(updates[0].fields.position!.x).toBe(10);
  });

  it('should send delta-only updates for small changes', () => {
    const mgr = new ReplicationManager();

    mgr.register('ragdoll1', 'ragdoll', 'player1', { updateIntervalMs: 0 });

    // First update (full)
    mgr.updateSnapshot('ragdoll1', { position: { x: 0, y: 0, z: 0 } });
    mgr.generateUpdates(100000);

    // Second update (delta: only position changed)
    mgr.updateSnapshot('ragdoll1', { position: { x: 5, y: 0, z: 0 } });
    const updates = mgr.generateUpdates(200000);

    expect(updates.length).toBe(1);
    expect(updates[0].isFullSnapshot).toBe(false);
    expect(updates[0].fields.position).toBeDefined();
  });

  it('should track replication stats', () => {
    const mgr = new ReplicationManager();
    mgr.register('a', 'transform', 'p1');
    mgr.register('b', 'transform', 'p1');
    mgr.register('c', 'vehicle', 'p2');

    const stats = mgr.getStats();
    expect(stats.totalEntities).toBe(3);
    expect(stats.dirtyEntities).toBe(3); // All new entities are dirty

    expect(mgr.getEntitiesByType('transform')).toHaveLength(2);
    expect(mgr.getEntitiesByType('vehicle')).toHaveLength(1);
  });
});
