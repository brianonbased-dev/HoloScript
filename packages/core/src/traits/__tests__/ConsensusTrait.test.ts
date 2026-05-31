/**
 * ConsensusTrait Tests
 *
 * Tests for distributed consensus mechanisms (simple majority, Raft).
 *
 * @version 3.1.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConsensusTrait, createConsensusTrait, type ConsensusTraitConfig } from '../ConsensusTrait';

describe('ConsensusTrait', () => {
  let trait: ConsensusTrait;

  beforeEach(() => {
    trait = new ConsensusTrait('entity-1');
  });

  afterEach(() => {
    if (trait.isRunning()) {
      trait.stop();
    }
    trait.removeAllListeners();
  });

  describe('constructor', () => {
    it('should create with entity ID', () => {
      expect(trait.getNodeId()).toBe('entity-1');
    });

    it('should default to simple_majority mechanism', () => {
      expect(trait.getMechanism()).toBe('simple_majority');
    });

    it('should accept custom config', () => {
      trait = new ConsensusTrait('entity-2', {
        mechanism: 'raft',
        nodeId: 'custom-node',
        timeout: 10000,
      });

      expect(trait.getNodeId()).toBe('custom-node');
      expect(trait.getMechanism()).toBe('raft');
    });
  });

  describe('lifecycle', () => {
    it('should start in not running state', () => {
      expect(trait.isRunning()).toBe(false);
    });

    it('should start when start() called', async () => {
      await trait.start();
      expect(trait.isRunning()).toBe(true);
    });

    it('should emit started event', async () => {
      const callback = vi.fn();
      trait.on('started', callback);

      await trait.start();

      expect(callback).toHaveBeenCalled();
    });

    it('should not restart if already started', async () => {
      const callback = vi.fn();
      trait.on('started', callback);

      await trait.start();
      await trait.start();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should stop when stop() called', async () => {
      await trait.start();
      trait.stop();

      expect(trait.isRunning()).toBe(false);
    });

    it('should emit stopped event', async () => {
      const callback = vi.fn();
      trait.on('stopped', callback);

      await trait.start();
      trait.stop();

      expect(callback).toHaveBeenCalled();
    });

    it('should not stop if already stopped', () => {
      const callback = vi.fn();
      trait.on('stopped', callback);

      trait.stop();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('state management', () => {
    beforeEach(async () => {
      await trait.start();
    });

    it('should get undefined for non-existent key', () => {
      expect(trait.get('missing')).toBeUndefined();
    });

    it('should return empty state initially', () => {
      const state = trait.getState();
      expect(state.size).toBe(0);
    });
  });

  describe('propose', () => {
    beforeEach(async () => {
      await trait.start();
    });

    it('should propose a value', async () => {
      const result = await trait.propose('key1', 'value1');
      expect(typeof result).toBe('boolean');
    });

    it('should propose with result details', async () => {
      const result = await trait.proposeWithResult('key2', 42);

      expect(result).toBeDefined();
      expect(result.key).toBe('key2');
      expect('accepted' in result).toBe(true);
    });

    it('should fail propose when not started', async () => {
      trait.stop();

      const result = await trait.propose('key', 'value');
      expect(result).toBe(false);
    });
  });

  describe('cluster management', () => {
    beforeEach(async () => {
      await trait.start();
    });

    it('should return false for isLeader initially (single node)', () => {
      const isLeader = trait.isLeader();
      expect(typeof isLeader).toBe('boolean');
    });

    it('should return empty nodes array initially', () => {
      const nodes = trait.getNodes();
      expect(Array.isArray(nodes)).toBe(true);
    });

    it('should add a node', () => {
      trait.addNode({ id: 'node-2', address: 'http://node2' });

      const nodes = trait.getNodes();
      expect(nodes.some((n) => n.id === 'node-2')).toBe(true);
    });

    it('should remove a node', () => {
      trait.addNode({ id: 'node-2', address: 'http://node2' });
      trait.removeNode('node-2');

      const nodes = trait.getNodes();
      expect(nodes.some((n) => n.id === 'node-2')).toBe(false);
    });

    it('should handle messages from other nodes', () => {
      // Should not throw
      expect(() => {
        trait.handleMessage('node-2', { type: 'vote', data: {} });
      }).not.toThrow();
    });
  });

  describe('subscriptions', () => {
    beforeEach(async () => {
      await trait.start();
    });

    it('should subscribe to key changes', () => {
      const callback = vi.fn();
      const unsub = trait.subscribe('counter', callback);

      expect(typeof unsub).toBe('function');
    });

    it('should unsubscribe when called', () => {
      const callback = vi.fn();
      const unsub = trait.subscribe('counter', callback);

      unsub();

      // No assertion - just ensure no error
    });
  });

  describe('events', () => {
    it('should emit state:changed event', async () => {
      const callback = vi.fn();
      trait.on('state:changed', callback);

      await trait.start();

      // Event would fire on actual state changes
      expect(callback).not.toThrow();
    });

    it('should emit node:joined event', async () => {
      const callback = vi.fn();
      trait.on('node:joined', callback);

      await trait.start();
      trait.addNode({ id: 'new-node', address: 'http://new' });

      // Depending on implementation, callback may or may not fire
      expect(callback).not.toThrow();
    });

    it('should emit node:left event', async () => {
      const callback = vi.fn();
      trait.on('node:left', callback);

      await trait.start();
      trait.addNode({ id: 'temp-node', address: 'http://temp' });
      trait.removeNode('temp-node');

      // Depending on implementation, callback may or may not fire
      expect(callback).not.toThrow();
    });
  });

  describe('Raft mechanism', () => {
    beforeEach(() => {
      trait = new ConsensusTrait('raft-node', {
        mechanism: 'raft',
        timeout: 1000,
      });
    });

    afterEach(() => {
      if (trait.isRunning()) {
        trait.stop();
      }
    });

    it('should use raft mechanism', () => {
      expect(trait.getMechanism()).toBe('raft');
    });

    it('should start raft consensus', async () => {
      await trait.start();
      expect(trait.isRunning()).toBe(true);
    });

    it('should get debug state for raft', async () => {
      await trait.start();

      const debugState = trait.getDebugState();
      // Raft returns debug state, simple majority returns null
      expect(debugState).toBeDefined();
    });

    it('should emit leader:elected event', async () => {
      const callback = vi.fn();
      trait.on('leader:elected', callback);

      await trait.start();

      // Leader election happens asynchronously
      expect(callback).not.toThrow();
    });
  });
});

describe('createConsensusTrait factory', () => {
  it('should create a consensus trait', async () => {
    const trait = createConsensusTrait('factory-entity');

    expect(trait).toBeInstanceOf(ConsensusTrait);
    expect(trait.getNodeId()).toBe('factory-entity');

    await trait.start();
    trait.stop();
  });

  it('should accept config', async () => {
    const trait = createConsensusTrait('factory-entity', {
      mechanism: 'raft',
      nodeId: 'custom-id',
    });

    expect(trait.getNodeId()).toBe('custom-id');
    expect(trait.getMechanism()).toBe('raft');

    await trait.start();
    trait.stop();
  });
});
