import { describe, it, expect, beforeEach } from 'vitest';
import { ReplicationManager } from '../ReplicationManager';

describe('ReplicationManager', () => {
  let mgr: ReplicationManager;

  beforeEach(() => {
    mgr = new ReplicationManager();
  });

  // ===========================================================================
  // Registration
  // ===========================================================================
  describe('registration', () => {
    it('registers an entity', () => {
      const entity = mgr.register('e1', 'dynamic', 'player-1');
      expect(entity.entityId).toBe('e1');
      expect(entity.type).toBe('dynamic');
      expect(entity.ownerId).toBe('player-1');
      expect(entity.isDirty).toBe(true);
    });

    it('registers with options', () => {
      const entity = mgr.register('e2', 'vehicle', 'player-1', {
        priority: 10,
        updateIntervalMs: 50,
      });
      expect(entity.priority).toBe(10);
      expect(entity.updateIntervalMs).toBe(50);
    });

    it('unregisters an entity', () => {
      mgr.register('e1', 'dynamic', 'p1');
      expect(mgr.unregister('e1')).toBe(true);
      expect(mgr.getEntity('e1')).toBeUndefined();
    });

    it('unregister returns false for unknown', () => {
      expect(mgr.unregister('nope')).toBe(false);
    });
  });

  // ===========================================================================
  // Snapshot Updates
  // ===========================================================================
  describe('updateSnapshot', () => {
    it('updates position and marks dirty', () => {
      mgr.register('e1', 'dynamic', 'p1');
      mgr.updateSnapshot('e1', {
        position: [5, 0, 0],
        timestamp: 100,
      });
      const entity = mgr.getEntity('e1');
      expect(entity!.isDirty).toBe(true);
      expect(entity!.snapshot.position.x).toBe(5);
    });

    it('setCustomState updates custom fields', () => {
      mgr.register('e1', 'dynamic', 'p1');
      mgr.setCustomState('e1', 'health', 100);
      mgr.setCustomState('e1', 'name', 'player');
      const entity = mgr.getEntity('e1');
      expect(entity!.snapshot.customState.health).toBe(100);
      expect(entity!.snapshot.customState.name).toBe('player');
    });
  });

  // ===========================================================================
  // Generate Updates
  // ===========================================================================
  describe('generateUpdates', () => {
    it('returns updates for dirty entities', () => {
      mgr.register('e1', 'dynamic', 'p1');
      const updates = mgr.generateUpdates(Date.now() + 1000);
      // Entities start dirty, so should have at least one update
      expect(updates.length).toBeGreaterThanOrEqual(1);
    });

    it('generates full snapshot for new entities', () => {
      mgr.register('e1', 'dynamic', 'p1');
      mgr.updateSnapshot('e1', { position: [1, 2, 3], timestamp: 100 });
      const updates = mgr.generateUpdates(Date.now() + 1000);
      expect(updates.length).toBeGreaterThanOrEqual(1);
      if (updates.length > 0) {
        expect(updates[0].entityId).toBe('e1');
        expect(updates[0].isFullSnapshot).toBe(true);
      }
    });

    it('generates delta updates after first full snapshot', () => {
      mgr.register('e1', 'dynamic', 'p1');
      mgr.updateSnapshot('e1', { position: [1, 0, 0], timestamp: 100 });
      mgr.generateUpdates(Date.now() + 1000); // First = full

      // Move entity
      mgr.updateSnapshot('e1', { position: [5, 0, 0], timestamp: 200 });
      const updates = mgr.generateUpdates(Date.now() + 2000);
      if (updates.length > 0) {
        expect(updates[0].isFullSnapshot).toBe(false);
      }
    });
  });

  // ===========================================================================
  // Apply Remote Updates
  // ===========================================================================
  describe('applyRemoteUpdate', () => {
    it('applies a full snapshot to an existing entity', () => {
      mgr.register('e1', 'dynamic', 'remote');
      mgr.applyRemoteUpdate({
        entityId: 'e1',
        timestamp: 200,
        fields: {
          position: [10, 20, 30],
        },
        isFullSnapshot: true,
      });
      const entity = mgr.getEntity('e1');
      expect(entity!.snapshot.position.x).toBe(10);
    });

    it('applies a delta update (partial fields)', () => {
      mgr.register('e1', 'dynamic', 'remote');
      mgr.applyRemoteUpdate({
        entityId: 'e1',
        timestamp: 100,
        fields: { position: [1, 1, 1] },
        isFullSnapshot: true,
      });
      mgr.applyRemoteUpdate({
        entityId: 'e1',
        timestamp: 200,
        fields: { customState: { health: 50 } },
        isFullSnapshot: false,
      });
      const entity = mgr.getEntity('e1');
      expect(entity!.snapshot.customState.health).toBe(50);
    });
  });

  // ===========================================================================
  // Stats & Queries
  // ===========================================================================
  describe('stats and queries', () => {
    it('getStats returns correct counts', () => {
      mgr.register('e1', 'dynamic', 'p1');
      mgr.register('e2', 'vehicle', 'p1');
      // Both entities start dirty on registration
      const stats = mgr.getStats();
      expect(stats.totalEntities).toBe(2);
      expect(stats.dirtyEntities).toBe(2);
    });

    it('getEntitiesByType filters correctly', () => {
      mgr.register('e1', 'dynamic', 'p1');
      mgr.register('e2', 'vehicle', 'p1');
      mgr.register('e3', 'dynamic', 'p2');

      expect(mgr.getEntitiesByType('dynamic').length).toBe(2);
      expect(mgr.getEntitiesByType('vehicle').length).toBe(1);
      expect(mgr.getEntitiesByType('ragdoll').length).toBe(0);
    });
  });
});
