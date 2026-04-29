/**
 * CRDTStateManager Production Tests
 *
 * Covers: createOperation (increments clock, returns CRDTOperation with correct
 * clientId/key/value), reconcile (applies op if no existing, higher clock wins,
 * tie-breaks by clientId lexicographic order, returns bool}, getSnapshot
 * (returns key→value map), getStateVector (returns clientId→clock map).
 */

import { describe, it, expect } from 'vitest';
import { CRDTStateManager } from '../../state/CRDTStateManager';

// ── createOperation ───────────────────────────────────────────────────────────

describe('CRDTStateManager — createOperation', () => {
  it('returns an operation with the correct clientId', () => {
    const crdt = new CRDTStateManager('clientA');
    const op = crdt.createOperation('x', 42);
    expect(op.clientId).toBe('clientA');
  });

  it('returns an operation with the provided key and value', () => {
    const crdt = new CRDTStateManager('c1');
    const op = crdt.createOperation('health', 100);
    expect(op.key).toBe('health');
    expect(op.value).toBe(100);
  });

  it('clock starts at 1 for the first operation', () => {
    const crdt = new CRDTStateManager('c1');
    const op = crdt.createOperation('k', 0);
    expect(op.clock).toBe(1);
  });

  it('clock increments with each operation', () => {
    const crdt = new CRDTStateManager('c1');
    crdt.createOperation('a', 1);
    crdt.createOperation('b', 2);
    const op3 = crdt.createOperation('c', 3);
    expect(op3.clock).toBe(3);
  });

  it('each operation is independent per key', () => {
    const crdt = new CRDTStateManager('c1');
    const op1 = crdt.createOperation('x', 1);
    const op2 = crdt.createOperation('y', 2);
    expect(op2.clock).toBe(op1.clock + 1);
  });
});

// ── reconcile ─────────────────────────────────────────────────────────────────

describe('CRDTStateManager — reconcile', () => {
  it('reconcile applies operation when register is empty', () => {
    const crdt = new CRDTStateManager('c1');
    const op = crdt.createOperation('x', 10);
    const result = crdt.reconcile(op);
    expect(result).toBe(true);
    expect(crdt.getSnapshot()[0]).toBe(10);
  });

  it('reconcile returns false when incoming op has lower clock', () => {
    const crdt = new CRDTStateManager('c1');
    const op1 = crdt.createOperation('x', 42);
    crdt.reconcile(op1);
    // Construct a stale op with lower clock
    const staleOp = { clientId: 'c2', clock: 0, key: 'x', value: 99 };
    expect(crdt.reconcile(staleOp)).toBe(false);
    expect(crdt.getSnapshot().x).toBe(42);
  });

  it('reconcile applies higher-clock op', () => {
    const crdt = new CRDTStateManager('c1');
    crdt.reconcile({ clientId: 'c1', clock: 1, key: 'y', value: 'old' });
    crdt.reconcile({ clientId: 'c2', clock: 5, key: 'y', value: 'new' });
    expect(crdt.getSnapshot().y).toBe('new');
  });

  it('tie-break: higher clientId string wins on equal clock', () => {
    const crdt = new CRDTStateManager('c1');
    crdt.reconcile({ clientId: 'a', clock: 3, key: 'k', value: 'alpha' });
    crdt.reconcile({ clientId: 'z', clock: 3, key: 'k', value: 'zeta' });
    expect(crdt.getSnapshot().k).toBe('zeta');
  });

  it('multiple keys are tracked independently', () => {
    const crdt = new CRDTStateManager('c1');
    crdt.reconcile({ clientId: 'c1', clock: 1, key: 'x', value: 10 });
    crdt.reconcile({ clientId: 'c1', clock: 1, key: 'y', value: 20 });
    const snap = crdt.getSnapshot();
    expect(snap[0]).toBe(10);
    expect(snap[1]).toBe(20);
  });
});

// ── getSnapshot ───────────────────────────────────────────────────────────────

describe('CRDTStateManager — getSnapshot', () => {
  it('returns empty object when nothing reconciled', () => {
    const crdt = new CRDTStateManager('c1');
    expect(crdt.getSnapshot()).toEqual({});
  });

  it('returns all reconciled key→value pairs', () => {
    const crdt = new CRDTStateManager('c1');
    crdt.reconcile({ clientId: 'c1', clock: 1, key: 'a', value: 1 });
    crdt.reconcile({ clientId: 'c1', clock: 2, key: 'b', value: 2 });
    expect(crdt.getSnapshot()).toMatchObject({ a: 1, b: 2 });
  });
});

// ── getStateVector ────────────────────────────────────────────────────────────

describe('CRDTStateManager — getStateVector', () => {
  it('includes own clientId after construction', () => {
    const crdt = new CRDTStateManager('me');
    expect(crdt.getStateVector()['me']).toBe(0);
  });

  it('reflects clock after createOperation', () => {
    const crdt = new CRDTStateManager('c1');
    crdt.createOperation('k', 1);
    crdt.createOperation('k', 2);
    expect(crdt.getStateVector()['c1']).toBe(2);
  });

  it('tracks remote client clocks after reconcile', () => {
    const crdt = new CRDTStateManager('c1');
    crdt.reconcile({ clientId: 'remote', clock: 7, key: 'x', value: 0 });
    expect(crdt.getStateVector()['remote']).toBe(7);
  });
});
