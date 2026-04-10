/**
 * NetworkedTrait Tests
 *
 * Tests for real-time multiplayer state synchronization.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkedTrait, createNetworkedTrait } from './NetworkedTrait';

describe('NetworkedTrait', () => {
  let trait: NetworkedTrait;

  beforeEach(() => {
    trait = createNetworkedTrait();
  });

  describe('factory function', () => {
    it('should create networked trait with factory', () => {
      expect(trait).toBeInstanceOf(NetworkedTrait);
    });

    it('should create with custom config', () => {
      const custom = createNetworkedTrait({
        mode: 'shared',
        syncRate: 30,
      });
      expect(custom.getConfig().mode).toBe('shared');
      expect(custom.getConfig().syncRate).toBe(30);
    });
  });

  describe('configuration', () => {
    it('should get configuration', () => {
      const config = trait.getConfig();
      expect(config).toBeDefined();
      expect(config.mode).toBeDefined();
    });

    it('should have default mode as owner', () => {
      expect(trait.getConfig().mode).toBe('owner');
    });

    it('should have default sync rate', () => {
      expect(trait.getConfig().syncRate).toBe(20);
    });
  });

  describe('ownership', () => {
    it('should track owner status', () => {
      trait.setOwner(true, 'player-123');
      expect(trait.isLocalOwner()).toBe(true);
    });

    it('should check if is local owner', () => {
      trait.setOwner(true, 'player-123');
      expect(trait.isLocalOwner()).toBe(true);
      trait.setOwner(false);
      expect(trait.isLocalOwner()).toBe(false);
    });

    it('should transfer ownership', () => {
      trait.setOwner(true, 'player-123');
      expect(trait.isLocalOwner()).toBe(true);
      trait.setOwner(false, 'player-456');
      expect(trait.isLocalOwner()).toBe(false);
    });
  });

  describe('state synchronization', () => {
    it('should set and get state', () => {
      trait.setProperty('health', 100);
      expect(trait.getProperty('health')).toBe(100);
    });

    it('should get full state', () => {
      trait.setProperty('position', [1, 2, 3]);
      trait.setProperty('health', 100);

      const state = trait.getState();
      expect(state).toBeDefined();
      expect(typeof state).toBe('object');
    });

    it('should apply state', () => {
      const state = { health: 50, name: 'test' };
      trait.applyState(state);
      expect(trait.getProperty('health')).toBe(50);
    });
  });

  describe('interpolation config', () => {
    it('should get interpolation config', () => {
      const config = trait.getInterpolationConfig();
      expect(config).toBeDefined();
      expect(typeof config.enabled).toBe('boolean');
    });

    it('should support custom interpolation settings', () => {
      const custom = createNetworkedTrait({
        interpolation: {
          enabled: true,
          delay: 200,
          mode: 'hermite',
        },
      });

      const interpConfig = custom.getInterpolationConfig();
      expect(interpConfig.enabled).toBe(true);
      expect(interpConfig.delay).toBe(200);
    });
  });

  describe('connection status', () => {
    it('should track connection status', () => {
      expect(trait.isConnected()).toBe(false);

      trait.setConnected(true, 'peer-123');
      expect(trait.isConnected()).toBe(true);
    });

    it('should emit connection events', () => {
      let eventFired = false;
      trait.on('connected', () => {
        eventFired = true;
      });

      trait.setConnected(true, 'peer-123');
      expect(eventFired).toBe(true);
    });
  });

  describe('sync modes', () => {
    it('should support owner mode', () => {
      const ownerTrait = createNetworkedTrait({ mode: 'owner' });
      expect(ownerTrait.getConfig().mode).toBe('owner');
    });

    it('should support shared mode', () => {
      const sharedTrait = createNetworkedTrait({ mode: 'shared' });
      expect(sharedTrait.getConfig().mode).toBe('shared');
    });

    it('should support server mode', () => {
      const serverTrait = createNetworkedTrait({ mode: 'server' });
      expect(serverTrait.getConfig().mode).toBe('server');
    });
  });

  describe('events', () => {
    it('should emit property change events', () => {
      let lastChange: unknown;
      trait.on('propertyChanged', (e) => {
        lastChange = e;
      });

      trait.setProperty('health', 50);
      expect(lastChange).toBeDefined();
    });

    it('should remove event listeners', () => {
      let count = 0;
      const handler = () => count++;

      trait.on('propertyChanged', handler);
      trait.setProperty('a', 1);
      expect(count).toBe(1);

      trait.off('propertyChanged', handler);
      trait.setProperty('b', 2);
      expect(count).toBe(1);
    });
  });

  describe('serialization', () => {
    it('should serialize state to ArrayBuffer', () => {
      trait.setProperty('x', 10);
      trait.setProperty('y', 20);

      const buffer = trait.serialize();
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBeGreaterThan(0);
    });

    it('should deserialize state from ArrayBuffer', () => {
      const testState = { score: 999, level: 5 };
      const json = JSON.stringify(testState);
      const encoder = new TextEncoder();
      const buffer = encoder.encode(json).buffer;

      trait.deserialize(buffer);
      expect(trait.getProperty('score')).toBe(999);
      expect(trait.getProperty('level')).toBe(5);
    });

    it('should round-trip serialize/deserialize', () => {
      trait.setProperty('pos', [1, 2, 3]);
      trait.setProperty('name', 'player');

      const buffer = trait.serialize();
      const newTrait = createNetworkedTrait();
      newTrait.deserialize(buffer);

      expect(newTrait.getProperty('pos')).toEqual([1, 2, 3]);
      expect(newTrait.getProperty('name')).toBe('player');
    });
  });

  describe('SyncProtocol integration', () => {
    it('should have getEntityId method', () => {
      const id = trait.getEntityId();
      expect(typeof id).toBe('string');
      expect(id).toContain('entity_');
    });

    it('should generate unique entity IDs', () => {
      const trait2 = createNetworkedTrait();
      expect(trait.getEntityId()).not.toBe(trait2.getEntityId());
    });

    it('should have getLatency method', () => {
      const latency = trait.getLatency();
      expect(typeof latency).toBe('number');
      expect(latency).toBeGreaterThanOrEqual(0);
    });

    it('should have disconnect method', () => {
      expect(() => trait.disconnect()).not.toThrow();
    });
  });

  describe('sync rate limiting', () => {
    it('should track pending updates', () => {
      trait.setProperty('test', 1);
      const updates = trait.flushUpdates();
      expect(updates).toHaveProperty('test', 1);
    });

    it('should clear updates on flush', () => {
      trait.setProperty('a', 1);
      trait.flushUpdates();

      const secondFlush = trait.flushUpdates();
      expect(Object.keys(secondFlush)).toHaveLength(0);
    });
  });

  describe('ownership transfer', () => {
    it('should request ownership for transferable config', async () => {
      const transferable = createNetworkedTrait({
        mode: 'shared',
        authority: {
          transferable: true,
        },
      });

      const result = await transferable.requestOwnership();
      expect(result).toBe(true);
    });

    it('should release ownership', () => {
      trait.setOwner(true);
      expect(trait.isLocalOwner()).toBe(true);

      trait.releaseOwnership();
      expect(trait.isLocalOwner()).toBe(false);
    });
  });
});
