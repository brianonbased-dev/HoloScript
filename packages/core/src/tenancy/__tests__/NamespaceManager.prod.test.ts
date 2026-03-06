/**
 * NamespaceManager — Production Tests
 *
 * Tests createNamespace, getNamespace, listNamespaces, deleteNamespace,
 * setNamespaceData, getNamespaceData, hasNamespace, cross-tenant isolation,
 * and validation guards.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NamespaceManager } from '../NamespaceManager';

// =============================================================================
// CONSTRUCTION
// =============================================================================

describe('NamespaceManager — Construction', () => {
  it('constructs without error', () => {
    expect(() => new NamespaceManager()).not.toThrow();
  });
});

// =============================================================================
// createNamespace
// =============================================================================

describe('NamespaceManager — createNamespace', () => {
  let mgr: NamespaceManager;

  beforeEach(() => { mgr = new NamespaceManager(); });

  it('creates namespace with correct tenantId and name', () => {
    const ns = mgr.createNamespace('t1', 'config');
    expect(ns.tenantId).toBe('t1');
    expect(ns.name).toBe('config');
  });

  it('newly created namespace has empty data map', () => {
    const ns = mgr.createNamespace('t1', 'ns');
    expect(ns.data.size).toBe(0);
  });

  it('createdAt is a recent Date', () => {
    const before = Date.now();
    const ns = mgr.createNamespace('t1', 'ns');
    const after = Date.now();
    expect(ns.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(ns.createdAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('throws when empty tenantId', () => {
    expect(() => mgr.createNamespace('', 'ns')).toThrow('tenantId is required');
  });

  it('throws when whitespace-only tenantId', () => {
    expect(() => mgr.createNamespace('   ', 'ns')).toThrow('tenantId is required');
  });

  it('throws when empty name', () => {
    expect(() => mgr.createNamespace('t1', '')).toThrow('Namespace name is required');
  });

  it('throws when name is whitespace only', () => {
    expect(() => mgr.createNamespace('t1', '  ')).toThrow('Namespace name is required');
  });

  it('throws when namespace already exists for tenant', () => {
    mgr.createNamespace('t1', 'dup');
    expect(() => mgr.createNamespace('t1', 'dup')).toThrow();
  });

  it('same name allowed for different tenants', () => {
    expect(() => {
      mgr.createNamespace('t1', 'shared');
      mgr.createNamespace('t2', 'shared');
    }).not.toThrow();
  });
});

// =============================================================================
// getNamespace
// =============================================================================

describe('NamespaceManager — getNamespace', () => {
  let mgr: NamespaceManager;

  beforeEach(() => { mgr = new NamespaceManager(); });

  it('returns the created namespace', () => {
    mgr.createNamespace('t1', 'ns');
    const ns = mgr.getNamespace('t1', 'ns');
    expect(ns.name).toBe('ns');
    expect(ns.tenantId).toBe('t1');
  });

  it('throws when tenant has no namespaces', () => {
    expect(() => mgr.getNamespace('ghost', 'ns')).toThrow();
  });

  it('throws when namespace not found for tenant', () => {
    mgr.createNamespace('t1', 'ns');
    expect(() => mgr.getNamespace('t1', 'other')).toThrow();
  });

  it('cross-tenant isolation: t2 cannot access t1 namespace', () => {
    mgr.createNamespace('t1', 'secret');
    expect(() => mgr.getNamespace('t2', 'secret')).toThrow();
  });
});

// =============================================================================
// hasNamespace
// =============================================================================

describe('NamespaceManager — hasNamespace', () => {
  let mgr: NamespaceManager;

  beforeEach(() => { mgr = new NamespaceManager(); });

  it('returns false for unknown tenant', () => {
    expect(mgr.hasNamespace('ghost', 'ns')).toBe(false);
  });

  it('returns false for unknown namespace on known tenant', () => {
    mgr.createNamespace('t1', 'ns');
    expect(mgr.hasNamespace('t1', 'missing')).toBe(false);
  });

  it('returns true for existing namespace', () => {
    mgr.createNamespace('t1', 'ns');
    expect(mgr.hasNamespace('t1', 'ns')).toBe(true);
  });

  it('returns false after namespace deleted', () => {
    mgr.createNamespace('t1', 'ns');
    mgr.deleteNamespace('t1', 'ns');
    expect(mgr.hasNamespace('t1', 'ns')).toBe(false);
  });
});

// =============================================================================
// listNamespaces
// =============================================================================

describe('NamespaceManager — listNamespaces', () => {
  let mgr: NamespaceManager;

  beforeEach(() => { mgr = new NamespaceManager(); });

  it('returns [] for unknown tenant', () => {
    expect(mgr.listNamespaces('ghost')).toEqual([]);
  });

  it('returns info for created namespaces', () => {
    mgr.createNamespace('t1', 'ns1');
    mgr.createNamespace('t1', 'ns2');
    const list = mgr.listNamespaces('t1');
    expect(list).toHaveLength(2);
    expect(list.map(n => n.name)).toContain('ns1');
    expect(list.map(n => n.name)).toContain('ns2');
  });

  it('info has dataKeyCount = 0 for fresh namespace', () => {
    mgr.createNamespace('t1', 'ns');
    const [info] = mgr.listNamespaces('t1');
    expect(info.dataKeyCount).toBe(0);
  });

  it('info reflects updated dataKeyCount after setNamespaceData', () => {
    mgr.createNamespace('t1', 'ns');
    mgr.setNamespaceData('t1', 'ns', 'k1', 'v1');
    mgr.setNamespaceData('t1', 'ns', 'k2', 'v2');
    const [info] = mgr.listNamespaces('t1');
    expect(info.dataKeyCount).toBe(2);
  });

  it('namespace list for t1 does not include t2 namespaces', () => {
    mgr.createNamespace('t1', 'ns');
    mgr.createNamespace('t2', 'other');
    expect(mgr.listNamespaces('t1').map(n => n.name)).not.toContain('other');
  });
});

// =============================================================================
// deleteNamespace
// =============================================================================

describe('NamespaceManager — deleteNamespace', () => {
  let mgr: NamespaceManager;

  beforeEach(() => { mgr = new NamespaceManager(); });

  it('deletes an existing namespace', () => {
    mgr.createNamespace('t1', 'ns');
    mgr.deleteNamespace('t1', 'ns');
    expect(mgr.hasNamespace('t1', 'ns')).toBe(false);
  });

  it('throws when namespace does not exist', () => {
    expect(() => mgr.deleteNamespace('t1', 'ghost')).toThrow();
  });

  it('allows re-creation after deletion', () => {
    mgr.createNamespace('t1', 'ns');
    mgr.deleteNamespace('t1', 'ns');
    expect(() => mgr.createNamespace('t1', 'ns')).not.toThrow();
  });

  it('cleans up tenant map when last namespace deleted (no throw on listNamespaces)', () => {
    mgr.createNamespace('t1', 'ns');
    mgr.deleteNamespace('t1', 'ns');
    expect(mgr.listNamespaces('t1')).toEqual([]);
  });
});

// =============================================================================
// setNamespaceData / getNamespaceData
// =============================================================================

describe('NamespaceManager — setNamespaceData / getNamespaceData', () => {
  let mgr: NamespaceManager;

  beforeEach(() => { mgr = new NamespaceManager(); });

  it('stores and retrieves a value', () => {
    mgr.createNamespace('t1', 'ns');
    mgr.setNamespaceData('t1', 'ns', 'key', 42);
    expect(mgr.getNamespaceData('t1', 'ns', 'key')).toBe(42);
  });

  it('returns undefined for missing key', () => {
    mgr.createNamespace('t1', 'ns');
    expect(mgr.getNamespaceData('t1', 'ns', 'nope')).toBeUndefined();
  });

  it('stores complex objects', () => {
    mgr.createNamespace('t1', 'ns');
    const obj = { a: [1, 2, 3], b: { c: 'hello' } };
    mgr.setNamespaceData('t1', 'ns', 'data', obj);
    expect(mgr.getNamespaceData('t1', 'ns', 'data')).toStrictEqual(obj);
  });

  it('overwrites existing key', () => {
    mgr.createNamespace('t1', 'ns');
    mgr.setNamespaceData('t1', 'ns', 'k', 'first');
    mgr.setNamespaceData('t1', 'ns', 'k', 'second');
    expect(mgr.getNamespaceData('t1', 'ns', 'k')).toBe('second');
  });

  it('data isolation: t2 cannot read t1 data', () => {
    mgr.createNamespace('t1', 'ns');
    mgr.createNamespace('t2', 'ns');
    mgr.setNamespaceData('t1', 'ns', 'secret', 'private');
    expect(() => mgr.getNamespaceData('t2', 'ns', 'secret')).not.toThrow();
    // t2's ns is a different namespace object — no shared data
    expect(mgr.getNamespaceData('t2', 'ns', 'secret')).toBeUndefined();
  });

  it('throws setNamespaceData when namespace missing', () => {
    expect(() => mgr.setNamespaceData('t1', 'missing', 'k', 'v')).toThrow();
  });

  it('throws getNamespaceData when namespace missing', () => {
    expect(() => mgr.getNamespaceData('t1', 'missing', 'k')).toThrow();
  });
});
