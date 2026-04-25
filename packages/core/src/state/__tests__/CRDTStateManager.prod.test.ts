/**
 * CRDTStateManager Production Tests
 *
 * CRDT state: createOperation, reconcile (HLC conflict resolution),
 * getSnapshot, getStateVector, concurrent conflict resolution.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CRDTStateManager } from '../CRDTStateManager';

describe('CRDTStateManager — Production', () => {
  let mgr: CRDTStateManager;

  beforeEach(() => {
    mgr = new CRDTStateManager('client-A');
  });

  describe('createOperation', () => {
    it('creates op with incrementing clock', () => {
      const op1 = mgr.createOperation('x', 10);
      expect(op1.clientId).toBe('client-A');
      expect(op1.clock).toBe(1);
      expect(op1.key).toBe('x');
      expect(op1.value).toBe(10);

      const op2 = mgr.createOperation('y', 20);
      expect(op2.clock).toBe(2);
    });
  });

  describe('reconcile', () => {
    it('accepts first operation for a key', () => {
      const op = mgr.createOperation('x', 100);
      expect(mgr.reconcile(op)).toBe(true);
      expect(mgr.getSnapshot()[0]).toBe(100);
    });

    it('accepts higher clock operation', () => {
      mgr.reconcile({ clientId: 'client-B', clock: 1, key: 'x', value: 'old' });
      const accepted = mgr.reconcile({ clientId: 'client-B', clock: 2, key: 'x', value: 'new' });
      expect(accepted).toBe(true);
      expect(mgr.getSnapshot()[0]).toBe('new');
    });

    it('rejects lower clock operation', () => {
      mgr.reconcile({ clientId: 'client-B', clock: 5, key: 'x', value: 'winner' });
      const rejected = mgr.reconcile({ clientId: 'client-B', clock: 3, key: 'x', value: 'loser' });
      expect(rejected).toBe(false);
      expect(mgr.getSnapshot()[0]).toBe('winner');
    });

    it('tie-breaks by clientId (higher wins)', () => {
      mgr.reconcile({ clientId: 'A', clock: 1, key: 'x', value: 'A-val' });
      const result = mgr.reconcile({ clientId: 'B', clock: 1, key: 'x', value: 'B-val' });
      expect(result).toBe(true); // 'B' > 'A'
      expect(mgr.getSnapshot()[0]).toBe('B-val');
    });

    it('updates state vector on reconcile', () => {
      mgr.reconcile({ clientId: 'client-B', clock: 5, key: 'y', value: 42 });
      const sv = mgr.getStateVector();
      expect(sv['client-B']).toBe(5);
    });
  });

  describe('getSnapshot', () => {
    it('returns all current values', () => {
      mgr.reconcile(mgr.createOperation('a', 1));
      mgr.reconcile(mgr.createOperation('b', 2));
      const snap = mgr.getSnapshot();
      expect(snap.a).toBe(1);
      expect(snap.b).toBe(2);
    });
  });

  describe('getStateVector', () => {
    it('includes local client', () => {
      const sv = mgr.getStateVector();
      expect(sv['client-A']).toBe(0);
    });
  });
});
