import { describe, it, expect } from 'vitest';
import { createDefaultPolicy, createStrictPolicy, mergePolicy } from '../SecurityPolicy';

describe('SecurityPolicy', () => {
  it('createDefaultPolicy returns expected defaults', () => {
    const p = createDefaultPolicy();
    expect(p.sandbox.enabled).toBe(true);
    expect(p.sandbox.memoryLimit).toBe(256);
    expect(p.sandbox.fileSystemAccess).toBe('workspace');
    expect(p.network.allowedHosts).toContain('*');
    expect(p.network.maxConnections).toBe(10);
    expect(p.code.maxObjectCount).toBe(1000);
    expect(p.code.requireSignedPackages).toBe(false);
  });

  it('createStrictPolicy has locked-down values', () => {
    const p = createStrictPolicy();
    expect(p.sandbox.memoryLimit).toBe(64);
    expect(p.sandbox.cpuTimeLimit).toBe(5);
    expect(p.sandbox.fileSystemAccess).toBe('none');
    expect(p.network.allowedHosts).toEqual([]);
    expect(p.network.maxConnections).toBe(0);
    expect(p.code.disallowedTraits).toContain('@unsafe');
    expect(p.code.requireSignedPackages).toBe(true);
  });

  it('mergePolicy overrides specific fields', () => {
    const base = createDefaultPolicy();
    const merged = mergePolicy(base, {
      sandbox: { memoryLimit: 512 },
      code: { maxObjectCount: 5000 },
    });
    expect(merged.sandbox.memoryLimit).toBe(512);
    expect(merged.sandbox.fileSystemAccess).toBe('workspace'); // unchanged
    expect(merged.code.maxObjectCount).toBe(5000);
    expect(merged.network.maxConnections).toBe(10); // unchanged
  });

  it('mergePolicy replaces arrays', () => {
    const base = createDefaultPolicy();
    const merged = mergePolicy(base, {
      network: { allowedHosts: ['api.example.com'] },
    });
    expect(merged.network.allowedHosts).toEqual(['api.example.com']);
  });

  it('mergePolicy with empty overrides returns base copy', () => {
    const base = createDefaultPolicy();
    const merged = mergePolicy(base, {});
    expect(merged.sandbox.memoryLimit).toBe(base.sandbox.memoryLimit);
    expect(merged.network.rateLimitPerSecond).toBe(base.network.rateLimitPerSecond);
  });

  it('strict policy has fewer syscalls than default', () => {
    const d = createDefaultPolicy();
    const s = createStrictPolicy();
    expect(s.sandbox.syscallAllowlist.length).toBeLessThan(d.sandbox.syscallAllowlist.length);
  });

  it('strict policy disallowedTraits includes dangerous traits', () => {
    const s = createStrictPolicy();
    for (const t of ['@unsafe', '@raw_memory', '@system_exec', '@native_call', '@eval']) {
      expect(s.code.disallowedTraits).toContain(t);
    }
  });
});
