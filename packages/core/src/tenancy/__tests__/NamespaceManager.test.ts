import { describe, it, expect, beforeEach } from 'vitest';
import { NamespaceManager } from '../NamespaceManager';

describe('NamespaceManager', () => {
  let mgr: NamespaceManager;

  beforeEach(() => {
    mgr = new NamespaceManager();
  });

  // ---- Create ----

  it('createNamespace returns namespace', () => {
    const ns = mgr.createNamespace('t1', 'cache');
    expect(ns.tenantId).toBe('t1');
    expect(ns.name).toBe('cache');
  });

  it('createNamespace throws on duplicate', () => {
    mgr.createNamespace('t1', 'cache');
    expect(() => mgr.createNamespace('t1', 'cache')).toThrow();
  });

  it('createNamespace throws on empty tenantId', () => {
    expect(() => mgr.createNamespace('', 'ns')).toThrow();
  });

  it('createNamespace throws on empty name', () => {
    expect(() => mgr.createNamespace('t1', '')).toThrow();
  });

  // ---- Get ----

  it('getNamespace retrieves existing', () => {
    mgr.createNamespace('t1', 'ns1');
    const ns = mgr.getNamespace('t1', 'ns1');
    expect(ns.name).toBe('ns1');
  });

  it('getNamespace throws for missing tenant', () => {
    expect(() => mgr.getNamespace('missing', 'ns')).toThrow();
  });

  it('getNamespace throws for missing namespace', () => {
    mgr.createNamespace('t1', 'ns1');
    expect(() => mgr.getNamespace('t1', 'missing')).toThrow();
  });

  // ---- List ----

  it('listNamespaces returns all for tenant', () => {
    mgr.createNamespace('t1', 'a');
    mgr.createNamespace('t1', 'b');
    mgr.createNamespace('t2', 'c');
    expect(mgr.listNamespaces('t1').length).toBe(2);
    expect(mgr.listNamespaces('t2').length).toBe(1);
  });

  it('listNamespaces returns empty for unknown tenant', () => {
    expect(mgr.listNamespaces('unknown')).toEqual([]);
  });

  // ---- Delete ----

  it('deleteNamespace removes namespace', () => {
    mgr.createNamespace('t1', 'ns1');
    mgr.deleteNamespace('t1', 'ns1');
    expect(mgr.hasNamespace('t1', 'ns1')).toBe(false);
  });

  it('deleteNamespace throws for missing', () => {
    expect(() => mgr.deleteNamespace('t1', 'nope')).toThrow();
  });

  // ---- Data ----

  it('set and get data in namespace', () => {
    mgr.createNamespace('t1', 'ns1');
    mgr.setNamespaceData('t1', 'ns1', 'key1', 'value1');
    expect(mgr.getNamespaceData('t1', 'ns1', 'key1')).toBe('value1');
  });

  it('getNamespaceData returns undefined for missing key', () => {
    mgr.createNamespace('t1', 'ns1');
    expect(mgr.getNamespaceData('t1', 'ns1', 'missing')).toBeUndefined();
  });

  // ---- Has ----

  it('hasNamespace returns boolean', () => {
    expect(mgr.hasNamespace('t1', 'ns1')).toBe(false);
    mgr.createNamespace('t1', 'ns1');
    expect(mgr.hasNamespace('t1', 'ns1')).toBe(true);
  });

  // ---- Isolation ----

  it('tenants cannot see each other namespaces', () => {
    mgr.createNamespace('t1', 'shared_name');
    mgr.createNamespace('t2', 'shared_name');
    mgr.setNamespaceData('t1', 'shared_name', 'key', 'from_t1');
    mgr.setNamespaceData('t2', 'shared_name', 'key', 'from_t2');
    expect(mgr.getNamespaceData('t1', 'shared_name', 'key')).toBe('from_t1');
    expect(mgr.getNamespaceData('t2', 'shared_name', 'key')).toBe('from_t2');
  });
});
