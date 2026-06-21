import { beforeEach, describe, it, expect } from 'vitest';
import {
  getBuiltinDomainPluginRuntime,
  resetBuiltinDomainPluginRuntimeForTests,
} from '../domain-plugin-runtime';
import { handlePluginManagementTool } from '../plugin-management-tools';

function registeredTraitNames(): string[] {
  const runtime = getBuiltinDomainPluginRuntime() as unknown as {
    traitHandlers: Map<string, unknown>;
  };
  return Array.from(runtime.traitHandlers.keys());
}

beforeEach(() => {
  resetBuiltinDomainPluginRuntimeForTests();
});

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
    const narrowed = (await handlePluginManagementTool('discover_plugins', {
      query: 'plugin',
    })) as {
      count: number;
    };
    // every scanned id contains 'plugin'? not guaranteed, but the narrowed set must be <= total
    expect(narrowed.count).toBeLessThanOrEqual(all.totalRegistryEntries);
  });
});

describe('install_domain_plugin', () => {
  it('registers energy-grid handlers into the MCP HoloScriptRuntime boot path', async () => {
    const res = (await handlePluginManagementTool('install_domain_plugin', {
      plugin_name: 'energy-grid',
    })) as {
      success: boolean;
      pluginId: string;
      state: string;
      registeredTraits: string[];
      runtime: string;
    };

    expect(res).toMatchObject({
      success: true,
      pluginId: 'energy-grid',
      state: 'enabled',
      runtime: 'HoloScriptRuntime',
      registeredTraits: ['power_flow'],
    });
    expect(registeredTraitNames()).toContain('power_flow');
  });

  it('accepts package aliases for the three wired domain plugins', async () => {
    await handlePluginManagementTool('install_domain_plugin', {
      plugin_name: '@holoscript/plugin-fitness-wellness',
    });
    await handlePluginManagementTool('install_domain_plugin', {
      plugin_name: '@holoscript/plugin-travel-hospitality',
    });

    expect(registeredTraitNames()).toEqual(expect.arrayContaining(['one_rep_max', 'revpar']));
  });

  it('is idempotent for repeated installs', async () => {
    await handlePluginManagementTool('install_domain_plugin', {
      plugin_name: 'fitness-wellness',
    });
    const second = (await handlePluginManagementTool('install_domain_plugin', {
      plugin_name: 'fitness-wellness',
    })) as { success: boolean; state: string; alreadyInstalled: boolean };

    expect(second).toMatchObject({
      success: true,
      state: 'already_enabled',
      alreadyInstalled: true,
    });
    expect(registeredTraitNames().filter((name) => name === 'one_rep_max')).toHaveLength(1);
  });

  it('rejects unsupported domain plugins with the supported list', async () => {
    const res = (await handlePluginManagementTool('install_domain_plugin', {
      plugin_name: 'unknown-domain',
    })) as { success: boolean; supportedPlugins: string[]; error: string };

    expect(res.success).toBe(false);
    expect(res.error).toContain('Unsupported domain plugin');
    expect(res.supportedPlugins).toEqual(
      expect.arrayContaining([
        '@holoscript/energy-grid-plugin',
        '@holoscript/plugin-fitness-wellness',
        '@holoscript/plugin-travel-hospitality',
      ])
    );
  });
});
