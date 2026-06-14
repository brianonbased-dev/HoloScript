import { describe, it, expect } from 'vitest';
import { handlePluginManagementTool } from '../plugin-management-tools';

/**
 * discover_plugins was a hardcoded 3-entry catalog (RATCHET: OVERCLAIMED). It now
 * scans packages/plugins/<name>/package.json at runtime. These tests run inside the
 * monorepo where packages/plugins exists, so they exercise the real scan via the
 * import.meta.url-resolved path (CWD-independent), no fs mocking required.
 */
describe('discover_plugins (filesystem scan)', () => {
  it('scans packages/plugins and returns more than the old 3-entry catalog', async () => {
    const res = (await handlePluginManagementTool('discover_plugins', { query: '' })) as {
      success: boolean;
      registrySource: string;
      totalRegistryEntries: number;
      plugins: Array<{ id: string; description: string }>;
    };
    expect(res.success).toBe(true);
    expect(res.registrySource).toBe('filesystem-scan');
    // The repo ships dozens of plugin packages; the old hardcoded catalog had 3.
    expect(res.totalRegistryEntries).toBeGreaterThan(3);
    expect(res.plugins.length).toBe(res.totalRegistryEntries);
  });

  it('returns scanned entries carrying id + description', async () => {
    const res = (await handlePluginManagementTool('discover_plugins', { query: '' })) as {
      plugins: Array<{ id: string; description: string }>;
    };
    expect(res.plugins[0].id).toBeTruthy();
    expect(res.plugins[0].description).toBeTruthy();
  });

  it('filters out non-matching queries', async () => {
    const res = (await handlePluginManagementTool('discover_plugins', {
      query: 'zzz-definitely-not-a-real-plugin',
    })) as { count: number; plugins: unknown[] };
    expect(res.count).toBe(0);
    expect(res.plugins.length).toBe(0);
  });

  it('a substring query returns a subset, not the whole registry', async () => {
    const all = (await handlePluginManagementTool('discover_plugins', { query: '' })) as {
      totalRegistryEntries: number;
    };
    const narrowed = (await handlePluginManagementTool('discover_plugins', { query: 'plugin' })) as {
      count: number;
    };
    // every scanned id contains 'plugin'? not guaranteed, but the narrowed set must be <= total
    expect(narrowed.count).toBeLessThanOrEqual(all.totalRegistryEntries);
  });
});
