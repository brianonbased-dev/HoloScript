/**
 * SecurityPolicy Production Tests
 *
 * Tests factory functions (default, strict) and deep-merge behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  createDefaultPolicy,
  createStrictPolicy,
  mergePolicy,
} from '../../security/SecurityPolicy';

describe('createDefaultPolicy — Production', () => {
  const policy = createDefaultPolicy();

  it('has sandbox enabled', () => {
    expect(policy.sandbox.enabled).toBe(true);
  });

  it('has reasonable memory limit', () => {
    expect(policy.sandbox.memoryLimit).toBe(256);
  });

  it('allows wildcard hosts', () => {
    expect(policy.network.allowedHosts).toContain('*');
  });

  it('has 1000 object limit', () => {
    expect(policy.code.maxObjectCount).toBe(1000);
  });

  it('does not require signed packages', () => {
    expect(policy.code.requireSignedPackages).toBe(false);
  });
});

describe('createStrictPolicy — Production', () => {
  const policy = createStrictPolicy();

  it('has much lower memory limit', () => {
    expect(policy.sandbox.memoryLimit).toBe(64);
  });

  it('disallows all hosts', () => {
    expect(policy.network.allowedHosts).toEqual([]);
  });

  it('has zero network connections', () => {
    expect(policy.network.maxConnections).toBe(0);
  });

  it('disallows unsafe traits', () => {
    expect(policy.code.disallowedTraits).toContain('@unsafe');
    expect(policy.code.disallowedTraits).toContain('@eval');
  });

  it('disallows file system access', () => {
    expect(policy.sandbox.fileSystemAccess).toBe('none');
  });

  it('requires signed packages', () => {
    expect(policy.code.requireSignedPackages).toBe(true);
  });
});

describe('mergePolicy — Production', () => {
  it('overrides sandbox values', () => {
    const merged = mergePolicy(createDefaultPolicy(), {
      sandbox: { memoryLimit: 512 },
    });
    expect(merged.sandbox.memoryLimit).toBe(512);
    // Non-overridden values preserved
    expect(merged.sandbox.enabled).toBe(true);
  });

  it('overrides network values', () => {
    const merged = mergePolicy(createDefaultPolicy(), {
      network: { maxConnections: 50 },
    });
    expect(merged.network.maxConnections).toBe(50);
  });

  it('overrides code values', () => {
    const merged = mergePolicy(createDefaultPolicy(), {
      code: { maxObjectCount: 5000 },
    });
    expect(merged.code.maxObjectCount).toBe(5000);
  });

  it('replaces arrays on override', () => {
    const merged = mergePolicy(createDefaultPolicy(), {
      network: { allowedHosts: ['example.com'] },
    });
    expect(merged.network.allowedHosts).toEqual(['example.com']);
  });

  it('preserves unmodified sections', () => {
    const base = createDefaultPolicy();
    const merged = mergePolicy(base, { sandbox: { memoryLimit: 128 } });
    expect(merged.network).toEqual(base.network);
    expect(merged.code).toEqual(base.code);
  });
});
