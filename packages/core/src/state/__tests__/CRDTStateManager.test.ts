/**
 * CRDTStateManager Unit Tests
 *
 * Tests local operations, conflict resolution, state vectors,
 * and snapshot generation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CRDTStateManager, type CRDTOperation } from '../CRDTStateManager';

describe('CRDTStateManager', () => {
  let crdt: CRDTStateManager;

  beforeEach(() => {
    crdt = new CRDTStateManager('client-A');
  });

  describe('createOperation', () => {
    it('should create a local operation with incrementing clock', () => {
      const op1 = crdt.createOperation('x', 10);
      expect(op1.clientId).toBe('client-A');
      expect(op1.clock).toBe(1);
      expect(op1.key).toBe('x');
      expect(op1.value).toBe(10);

      const op2 = crdt.createOperation('y', 20);
      expect(op2.clock).toBe(2);
    });
  });

  describe('reconcile', () => {
    it('should accept new key operations', () => {
      const op: CRDTOperation = { clientId: 'client-B', clock: 1, key: 'x', value: 42 };
      expect(crdt.reconcile(op)).toBe(true);
      expect(crdt.getSnapshot()[0]).toBe(42);
    });

    it('should accept higher clock updates', () => {
      crdt.reconcile({ clientId: 'client-B', clock: 1, key: 'x', value: 10 });
      const accepted = crdt.reconcile({ clientId: 'client-B', clock: 2, key: 'x', value: 20 });
      expect(accepted).toBe(true);
      expect(crdt.getSnapshot()[0]).toBe(20);
    });

    it('should reject lower clock updates', () => {
      crdt.reconcile({ clientId: 'client-B', clock: 5, key: 'x', value: 50 });
      const rejected = crdt.reconcile({ clientId: 'client-B', clock: 3, key: 'x', value: 30 });
      expect(rejected).toBe(false);
      expect(crdt.getSnapshot()[0]).toBe(50);
    });

    it('should tie-break by clientId (lexicographic)', () => {
      crdt.reconcile({ clientId: 'client-A', clock: 1, key: 'x', value: 'A' });
      const result = crdt.reconcile({ clientId: 'client-B', clock: 1, key: 'x', value: 'B' });
      expect(result).toBe(true); // B > A lexicographically
      expect(crdt.getSnapshot()[0]).toBe('B');
    });
  });

  describe('getSnapshot', () => {
    it('should return all current values', () => {
      crdt.createOperation('a', 1);
      crdt.reconcile(crdt.createOperation('a', 1));
      crdt.reconcile(crdt.createOperation('b', 2));
      const snap = crdt.getSnapshot();
      expect(snap.a).toBe(1);
      expect(snap.b).toBe(2);
    });

    it('should return empty snapshot initially', () => {
      expect(crdt.getSnapshot()).toEqual({});
    });
  });

  describe('getStateVector', () => {
    it('should track local clock', () => {
      crdt.createOperation('x', 1);
      crdt.createOperation('y', 2);
      const sv = crdt.getStateVector();
      expect(sv['client-A']).toBe(2);
    });

    it('should track remote clocks', () => {
      crdt.reconcile({ clientId: 'client-B', clock: 5, key: 'x', value: 10 });
      const sv = crdt.getStateVector();
      expect(sv['client-B']).toBe(5);
    });

    it('should take max of received clocks', () => {
      crdt.reconcile({ clientId: 'client-B', clock: 3, key: 'x', value: 1 });
      crdt.reconcile({ clientId: 'client-B', clock: 7, key: 'y', value: 2 });
      crdt.reconcile({ clientId: 'client-B', clock: 5, key: 'z', value: 3 }); // lower → still max 7
      expect(crdt.getStateVector()['client-B']).toBe(7);
    });
  });
});
