/**
 * ReplicationManager — Production Test Suite
 *
 * Covers: entity registration, snapshot updates, delta compression,
 * custom state replication, vec3/quat diffing, stats, batch updates.
 */
import { describe, it, expect } from 'vitest';
import { ReplicationManager } from '../ReplicationManager';

describe('ReplicationManager — Production', () => {
  // ─── Registration ─────────────────────────────────────────────────
  it('register creates replicated entity', () => {
    const rm = new ReplicationManager();
    const ent = rm.register('e1', 'transform', 'owner-1');
    expect(ent.entityId).toBe('e1');
    expect(ent.ownerId).toBe('owner-1');
    expect(ent.isDirty).toBe(true);
    expect(ent.sentFullSnapshot).toBe(false);
  });

  it('register with custom priority', () => {
    const rm = new ReplicationManager();
    const ent = rm.register('e1', 'custom', 'owner', { priority: 5 });
    expect(ent.priority).toBe(5);
  });

  it('unregister removes entity', () => {
    const rm = new ReplicationManager();
    rm.register('e1', 'transform', 'owner');
    expect(rm.unregister('e1')).toBe(true);
    expect(rm.getEntity('e1')).toBeUndefined();
  });

  // ─── Snapshot Updates ─────────────────────────────────────────────
  it('updateSnapshot marks entity dirty', () => {
    const rm = new ReplicationManager();
    rm.register('e1', 'transform', 'owner');
    rm.updateSnapshot('e1', { position: [1, 2, 3] });
    const ent = rm.getEntity('e1')!;
    expect(ent.isDirty).toBe(true);
    expect(ent.snapshot.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('setCustomState marks dirty and stores state', () => {
    const rm = new ReplicationManager();
    rm.register('e1', 'transform', 'owner');
    rm.setCustomState('e1', 'health', 100);
    const ent = rm.getEntity('e1')!;
    expect(ent.isDirty).toBe(true);
    expect(ent.snapshot.customState.health).toBe(100);
  });

  // ─── Delta Compression ────────────────────────────────────────────
  it('generateUpdates produces full snapshot on first update', () => {
    const rm = new ReplicationManager();
    rm.register('e1', 'transform', 'owner');
    rm.updateSnapshot('e1', { position: [1, 0, 0] });
    const updates = rm.generateUpdates(1000);
    expect(updates.length).toBe(1);
    expect(updates[0].isFullSnapshot).toBe(true);
  });

  it('generateUpdates produces delta after first snapshot', () => {
    const rm = new ReplicationManager();
    rm.register('e1', 'transform', 'owner');
    rm.updateSnapshot('e1', { position: [0, 0, 0] });
    rm.generateUpdates(1000); // full snapshot sent

    // Now change position
    rm.updateSnapshot('e1', { position: [5, 0, 0] });
    const updates = rm.generateUpdates(2000);
    expect(updates.length).toBe(1);
    expect(updates[0].isFullSnapshot).toBe(false);
    expect(updates[0].fields.position).toEqual({ x: 5, y: 0, z: 0 });
  });

  it('generateUpdates cleans dirty flag after sending', () => {
    const rm = new ReplicationManager();
    rm.register('e1', 'transform', 'owner');
    rm.generateUpdates(1000); // sends full, clears dirty
    const updates = rm.generateUpdates(2000); // now clean
    expect(updates.length).toBe(0);
  });

  // ─── Apply Remote Update ──────────────────────────────────────────
  it('applyRemoteUpdate updates entity snapshot', () => {
    const rm = new ReplicationManager();
    rm.register('e1', 'transform', 'owner');
    rm.applyRemoteUpdate({
      entityId: 'e1',
      timestamp: 100,
      fields: { position: [10, 20, 30] },
      isFullSnapshot: false,
    });
    const ent = rm.getEntity('e1')!;
    expect(ent.snapshot.position).toEqual({ x: 10, y: 20, z: 30 });
  });

  // ─── Stats ────────────────────────────────────────────────────────
  it('getStats returns entity counts', () => {
    const rm = new ReplicationManager();
    rm.register('e1', 'transform', 'owner');
    rm.register('e2', 'transform', 'owner');
    rm.updateSnapshot('e1', { position: [1, 0, 0] });
    const stats = rm.getStats();
    expect(stats.totalEntities).toBe(2);
    expect(stats.dirtyEntities).toBe(2);
  });

  // ─── Entities By Type ─────────────────────────────────────────────
  it('getEntitiesByType filters correctly', () => {
    const rm = new ReplicationManager();
    rm.register('e1', 'transform', 'owner');
    rm.register('e2', 'custom', 'owner');
    rm.register('e3', 'transform', 'owner');
    expect(rm.getEntitiesByType('transform').sort()).toEqual(['e1', 'e3']);
    expect(rm.getEntitiesByType('custom')).toEqual(['e2']);
  });
});
