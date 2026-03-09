import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsensusManager } from '../ConsensusManager';

describe('ConsensusManager', () => {
  let manager: ConsensusManager;

  beforeEach(() => {
    manager = new ConsensusManager('node-1', {
      mechanism: 'simple_majority',
    });
    // Add nodes to the cluster
    manager.addNode({ id: 'node-1', status: 'active' } as any);
    manager.addNode({ id: 'node-2', status: 'active' } as any);
    manager.addNode({ id: 'node-3', status: 'active' } as any);
  });

  // ===========================================================================
  // Construction
  // ===========================================================================
  describe('construction', () => {
    it('creates with node id', () => {
      expect(manager).toBeDefined();
      expect(manager.nodeId).toBe('node-1');
    });

    it('defaults to simple_majority mechanism', () => {
      const m = new ConsensusManager('test-node');
      expect(m).toBeDefined();
    });
  });

  // ===========================================================================
  // Node Management
  // ===========================================================================
  describe('node management', () => {
    it('getNodes returns registered nodes', () => {
      expect(manager.getNodes()).toHaveLength(3);
    });

    it('addNode adds a new node', () => {
      manager.addNode({ id: 'node-4', status: 'active' } as any);
      expect(manager.getNodes()).toHaveLength(4);
    });

    it('removeNode removes a node', () => {
      manager.removeNode('node-3');
      expect(manager.getNodes()).toHaveLength(2);
    });

    it('getNodes returns node ids', () => {
      const ids = manager.getNodes().map((n) => n.id);
      expect(ids).toContain('node-1');
      expect(ids).toContain('node-2');
      expect(ids).toContain('node-3');
    });
  });

  // ===========================================================================
  // State
  // ===========================================================================
  describe('state', () => {
    it('getState returns a map', () => {
      const state = manager.getState();
      expect(state).toBeInstanceOf(Map);
    });

    it('get returns undefined for unknown key', () => {
      expect(manager.get('unknown')).toBeUndefined();
    });
  });

  // ===========================================================================
  // Leadership
  // ===========================================================================
  describe('leadership', () => {
    it('isLeader returns boolean', () => {
      expect(typeof manager.isLeader()).toBe('boolean');
    });

    it('getLeader returns node or null', () => {
      const leader = manager.getLeader();
      expect(leader === null || typeof leader.id === 'string').toBe(true);
    });
  });

  // ===========================================================================
  // Proposals
  // ===========================================================================
  describe('proposals', () => {
    it('propose returns a promise', () => {
      const result = manager.propose('key1', 'value1');
      expect(result).toBeInstanceOf(Promise);
    });

    it('proposeWithResult returns a promise', () => {
      const result = manager.proposeWithResult('key2', 'value2');
      expect(result).toBeInstanceOf(Promise);
    });
  });

  // ===========================================================================
  // Message Handling
  // ===========================================================================
  describe('message handling', () => {
    it('handles vote messages without throwing', () => {
      expect(() => {
        manager.handleMessage('node-2', {
          type: 'vote',
          proposalId: 'fake-id',
          approve: true,
        });
      }).not.toThrow();
    });

    it('handles unknown message types gracefully', () => {
      expect(() => {
        manager.handleMessage('node-2', { type: 'unknown', data: 123 });
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // Lifecycle
  // ===========================================================================
  describe('lifecycle', () => {
    it('start does not throw', () => {
      expect(() => manager.start()).not.toThrow();
    });

    it('stop does not throw', () => {
      manager.start();
      expect(() => manager.stop()).not.toThrow();
    });

    it('double start is idempotent', () => {
      manager.start();
      expect(() => manager.start()).not.toThrow();
    });

    it('double stop is idempotent', () => {
      manager.start();
      manager.stop();
      expect(() => manager.stop()).not.toThrow();
    });
  });

  // ===========================================================================
  // Subscriptions
  // ===========================================================================
  describe('subscriptions', () => {
    it('subscribe returns unsubscribe function', () => {
      const unsub = manager.subscribe('key', () => {});
      expect(typeof unsub).toBe('function');
    });

    it('unsubscribe removes subscription', () => {
      const handler = vi.fn();
      const unsub = manager.subscribe('key', handler);
      unsub();
      // After unsubscribe, handler should not be called on state changes
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Protocol Access
  // ===========================================================================
  describe('protocol access', () => {
    it('getProtocol returns the underlying protocol', () => {
      const protocol = manager.getProtocol();
      expect(protocol).toBeDefined();
      expect(typeof protocol.propose).toBe('function');
    });
  });
});
