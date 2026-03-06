/**
 * IsolationEnforcer — Production Tests
 *
 * Tests validateResourceAccess, isolateExecution, validateNamespace,
 * getIsolatedNamespace, and TenantIsolationError properties.
 */

import { describe, it, expect } from 'vitest';
import {
  TenantIsolationError,
  validateResourceAccess,
  isolateExecution,
  validateNamespace,
  getIsolatedNamespace,
} from '../IsolationEnforcer';
import type { TenantContext } from '../TenantManager';

// =============================================================================
// HELPERS
// =============================================================================

function ctx(tenantId: string): TenantContext {
  return { tenantId } as TenantContext;
}

// =============================================================================
// TenantIsolationError
// =============================================================================

describe('TenantIsolationError', () => {
  it('creates error with correct name', () => {
    const err = new TenantIsolationError('a', 'b');
    expect(err.name).toBe('TenantIsolationError');
  });

  it('stores requestingTenantId and resourceTenantId', () => {
    const err = new TenantIsolationError('alice', 'bob');
    expect(err.requestingTenantId).toBe('alice');
    expect(err.resourceTenantId).toBe('bob');
  });

  it('message includes both tenant IDs', () => {
    const err = new TenantIsolationError('alice', 'bob');
    expect(err.message).toContain('alice');
    expect(err.message).toContain('bob');
  });

  it('message includes detail when provided', () => {
    const err = new TenantIsolationError('x', 'y', 'custom detail');
    expect(err.message).toContain('custom detail');
  });

  it('is instance of Error', () => {
    expect(new TenantIsolationError('a', 'b')).toBeInstanceOf(Error);
  });
});

// =============================================================================
// validateResourceAccess
// =============================================================================

describe('validateResourceAccess', () => {
  it('does not throw when context tenant matches resource tenant', () => {
    expect(() => validateResourceAccess(ctx('tenant-1'), 'tenant-1')).not.toThrow();
  });

  it('throws TenantIsolationError on mismatch', () => {
    expect(() => validateResourceAccess(ctx('alice'), 'bob'))
      .toThrow(TenantIsolationError);
  });

  it('thrown error has correct requestingTenantId', () => {
    try {
      validateResourceAccess(ctx('alice'), 'bob');
    } catch (e) {
      expect((e as TenantIsolationError).requestingTenantId).toBe('alice');
    }
  });

  it('thrown error has correct resourceTenantId', () => {
    try {
      validateResourceAccess(ctx('alice'), 'bob');
    } catch (e) {
      expect((e as TenantIsolationError).resourceTenantId).toBe('bob');
    }
  });

  it('empty string tenant mismatch throws', () => {
    expect(() => validateResourceAccess(ctx(''), 'other')).toThrow();
  });

  it('same tenant always passes regardless of value', () => {
    for (const id of ['', 'x', 'tenant-123', 'a'.repeat(100)]) {
      expect(() => validateResourceAccess(ctx(id), id)).not.toThrow();
    }
  });
});

// =============================================================================
// isolateExecution
// =============================================================================

describe('isolateExecution', () => {
  it('calls fn with correct namespace prefix', async () => {
    let received = '';
    await isolateExecution(ctx('t1'), (prefix) => { received = prefix; });
    expect(received).toBe('tenant:t1:');
  });

  it('returns the value from fn', async () => {
    const result = await isolateExecution(ctx('t2'), (prefix) => `${prefix}data`);
    expect(result).toBe('tenant:t2:data');
  });

  it('works with async fn', async () => {
    const result = await isolateExecution(ctx('async-t'), async (prefix) => {
      return Promise.resolve(prefix + 'ok');
    });
    expect(result).toBe('tenant:async-t:ok');
  });

  it('executes fn once', async () => {
    let calls = 0;
    await isolateExecution(ctx('t'), () => { calls++; });
    expect(calls).toBe(1);
  });

  it('different tenants get different namespace prefixes', async () => {
    const r1 = await isolateExecution(ctx('t-A'), p => p);
    const r2 = await isolateExecution(ctx('t-B'), p => p);
    expect(r1).not.toBe(r2);
  });
});

// =============================================================================
// validateNamespace
// =============================================================================

describe('validateNamespace', () => {
  it('does not throw for valid namespace', () => {
    expect(() => validateNamespace(ctx('t1'), 'tenant:t1:some-resource')).not.toThrow();
  });

  it('throws TenantIsolationError for namespace of different tenant', () => {
    expect(() => validateNamespace(ctx('t1'), 'tenant:t2:resource'))
      .toThrow(TenantIsolationError);
  });

  it('throws for namespace with no tenant prefix', () => {
    expect(() => validateNamespace(ctx('t1'), 'raw-key')).toThrow(TenantIsolationError);
  });

  it('error message references the namespace', () => {
    try {
      validateNamespace(ctx('t1'), 'tenant:t2:resource');
    } catch (e) {
      expect((e as TenantIsolationError).message).toContain('tenant:t2:resource');
    }
  });

  it('allows any key within correct tenant namespace', () => {
    for (const key of ['config', 'user/profile', 'data/x/y/z']) {
      expect(() =>
        validateNamespace(ctx('myTenant'), `tenant:myTenant:${key}`)
      ).not.toThrow();
    }
  });
});

// =============================================================================
// getIsolatedNamespace
// =============================================================================

describe('getIsolatedNamespace', () => {
  it('prepends tenant prefix to name', () => {
    expect(getIsolatedNamespace(ctx('abc'), 'config'))
      .toBe('tenant:abc:config');
  });

  it('works with empty name', () => {
    expect(getIsolatedNamespace(ctx('t'), '')).toBe('tenant:t:');
  });

  it('result passes validateNamespace for same tenant', () => {
    const ns = getIsolatedNamespace(ctx('t1'), 'users');
    expect(() => validateNamespace(ctx('t1'), ns)).not.toThrow();
  });

  it('result fails validateNamespace for different tenant', () => {
    const ns = getIsolatedNamespace(ctx('t1'), 'users');
    expect(() => validateNamespace(ctx('t2'), ns)).toThrow(TenantIsolationError);
  });

  it('different tenants produce different namespaces for same key', () => {
    const ns1 = getIsolatedNamespace(ctx('alice'), 'data');
    const ns2 = getIsolatedNamespace(ctx('bob'), 'data');
    expect(ns1).not.toBe(ns2);
  });
});
