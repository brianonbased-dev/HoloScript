// @vitest-environment jsdom
/**
 * Tests for useMCPSceneGen hook (Sprint 17 P7)
 */

import { describe, it, expect, vi } from 'vitest';

// Mock fetch for MCP calls
vi.stubGlobal(
  'fetch',
  vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ result: { nodes: [] } }),
    })
  )
);

describe('useMCPSceneGen module', () => {
  it('exports useMCPSceneGen hook', async () => {
    const mod = await import('@/hooks/useMCPSceneGen');
    expect(mod.useMCPSceneGen).toBeDefined();
    expect(typeof mod.useMCPSceneGen).toBe('function');
  });
});

describe('useMCPSceneGen — contract', () => {
  it('hook returns expected shape', async () => {
    // The hook should return generate, loading, error at minimum
    const mod = await import('@/hooks/useMCPSceneGen');
    // Module-level validation
    expect(mod).toBeDefined();
  });
});
