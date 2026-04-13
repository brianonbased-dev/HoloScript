import { describe, it, expect } from 'vitest';
import {
  validateResourceAccess,
  isolateExecution,
  validateNamespace,
  getIsolatedNamespace,
  TenantIsolationError,
} from '@holoscript/core';
import type { TenantContext } from '@holoscript/core';

function ctx(tenantId: string): TenantContext {
  return { tenantId, name: `Tenant ${tenantId}`, createdAt: new Date(), config: {}, active: true };
}

describe('IsolationEnforcer', () => {
  // ---- validateResourceAccess ----

  it('allows access to own resources', () => {
    expect(() => validateResourceAccess(ctx('t1'), 't1')).not.toThrow();
  });

  it('throws on cross-tenant access', () => {
    expect(() => validateResourceAccess(ctx('t1'), 't2')).toThrow(TenantIsolationError);
  });

  it('error contains both tenant IDs', () => {
    try {
      validateResourceAccess(ctx('t1'), 't2');
    } catch (e: any) {
      expect(e.requestingTenantId).toBe('t1');
      expect(e.resourceTenantId).toBe('t2');
    }
  });

  // ---- isolateExecution ----

  it('provides tenant-scoped namespace prefix', async () => {
    const result = await isolateExecution(ctx('abc'), (prefix) => prefix);
    expect(result).toBe('tenant:abc:');
  });

  it('returns function result', async () => {
    const result = await isolateExecution(ctx('t'), () => 42);
    expect(result).toBe(42);
  });

  it('handles async functions', async () => {
    const result = await isolateExecution(ctx('t'), async (prefix) => `${prefix}data`);
    expect(result).toBe('tenant:t:data');
  });

  // ---- validateNamespace ----

  it('accepts correct namespace', () => {
    expect(() => validateNamespace(ctx('t1'), 'tenant:t1:myns')).not.toThrow();
  });

  it('rejects wrong namespace', () => {
    expect(() => validateNamespace(ctx('t1'), 'tenant:t2:myns')).toThrow(TenantIsolationError);
  });

  it('rejects unprefixed namespace', () => {
    expect(() => validateNamespace(ctx('t1'), 'random:ns')).toThrow(TenantIsolationError);
  });

  // ---- getIsolatedNamespace ----

  it('creates tenant-prefixed namespace', () => {
    expect(getIsolatedNamespace(ctx('abc'), 'cache')).toBe('tenant:abc:cache');
  });
});
