/**
 * @holoscript/mcp-server — Plugin Management MCP Tools
 *
 * 3 tools for installing, listing, and managing plugins.
 *
 * Part of HoloScript v5.7 "Open Ecosystem".
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  getPluginLifecycleManager,
  type InstallPluginOptions,
  type SandboxPermission,
  type PluginLifecycleState,
} from '@holoscript/core';

// ESM-safe __dirname (matches trait-categories-from-core.ts). tsup emits ESM, so the
// native __dirname is absent; both src/ and dist/ sit at depth 2 under packages/mcp-server,
// so ../../plugins resolves to packages/plugins in dev (vitest) and prod (dist) alike.
const __dirname = dirname(fileURLToPath(import.meta.url));

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const pluginManagementTools: Tool[] = [
  {
    name: 'install_plugin',
    description:
      'Install a HoloScript plugin with sandboxed execution. Provide plugin metadata and code. Returns installation result.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Plugin identifier (kebab-case)',
        },
        name: {
          type: 'string',
          description: 'Plugin display name',
        },
        version: {
          type: 'string',
          description: 'Plugin version (semver)',
        },
        description: {
          type: 'string',
          description: 'Plugin description',
        },
        code: {
          type: 'string',
          description: 'Plugin JavaScript source code',
        },
        permissions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Permissions to grant (e.g. tool:register, event:emit)',
        },
      },
      required: ['id', 'name', 'version', 'code'],
    },
  },
  {
    name: 'install_domain_plugin',
    description:
      'STUB: Install a pre-packaged domain plugin by package name. Not yet implemented — returns failure. Use install_plugin for runtime-loaded plugins.',
    inputSchema: {
      type: 'object',
      properties: {
        plugin_name: {
          type: 'string',
          description: 'NPM package name of the plugin to load',
        },
      },
      required: ['plugin_name'],
    },
  },
  {
    name: 'discover_plugins',
    description:
      'Discover available domain plugins by query or category. Scans packages/plugins/*/package.json at runtime (name, description, keywords) for a live plugin index.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search intent',
        },
        category: {
          type: 'string',
          description: 'Optional category filter',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_plugins',
    description:
      'List all installed plugins with their state, version, permissions, and registered tools.',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          description:
            'Filter by lifecycle state (installed, verified, sandboxed, enabled, disabled)',
        },
      },
    },
  },
  {
    name: 'manage_plugin',
    description:
      'Manage a plugin lifecycle: enable, disable, or uninstall. Use action parameter to specify the operation.',
    inputSchema: {
      type: 'object',
      properties: {
        pluginId: {
          type: 'string',
          description: 'Plugin identifier',
        },
        action: {
          type: 'string',
          enum: ['enable', 'disable', 'uninstall'],
          description: 'Lifecycle action to perform',
        },
      },
      required: ['pluginId', 'action'],
    },
  },
];

// =============================================================================
// HANDLER
// =============================================================================

export async function handlePluginManagementTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'install_plugin':
      return handleInstallPlugin(args);
    case 'list_plugins':
      return handleListPlugins(args);
    case 'manage_plugin':
      return handleManagePlugin(args);
    case 'install_domain_plugin':
      return handleInstallDomainPlugin(args);
    case 'discover_plugins':
      return handleDiscoverPlugins(args);
    default:
      throw new Error(`Unknown plugin management tool: ${name}`);
  }
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function handleInstallPlugin(args: Record<string, unknown>) {
  const manager = getPluginLifecycleManager();

  const options: InstallPluginOptions = {
    id: args.id as string,
    name: (args.name as string) || (args.id as string),
    version: (args.version as string) || '0.1.0',
    description: (args.description as string) || '',
    code: args.code as string,
    permissions: (args.permissions as SandboxPermission[]) || ['tool:register', 'event:emit'],
  };

  try {
    // Install
    const plugin = manager.install(options);

    // Skip signature verification for MCP-installed plugins
    manager.skipVerification(plugin.id);

    // Create sandbox
    manager.sandbox(plugin.id);

    // Enable (execute code)
    const enableResult = await manager.enable(plugin.id);

    if (!enableResult.success) {
      return {
        success: false,
        pluginId: plugin.id,
        state: 'error',
        error: enableResult.error,
      };
    }

    // Get registered tools
    const sandbox = plugin.sandbox;
    const tools = sandbox ? sandbox.getTools().map((t: any) => t.name) : [];

    return {
      success: true,
      pluginId: plugin.id,
      state: plugin.state,
      version: plugin.version,
      tools,
      permissions: plugin.permissions,
    };
  } catch (err) {
    return {
      success: false,
      pluginId: args.id,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function handleListPlugins(args: Record<string, unknown>) {
  const manager = getPluginLifecycleManager();
  const stateFilter = args.state as string | undefined;

  const allPlugins = stateFilter
    ? manager.getPluginsByState(stateFilter as PluginLifecycleState)
    : manager.getAllPlugins();

  const plugins = allPlugins.map((p: any) => ({
    id: p.id,
    name: p.name,
    version: p.version,
    description: p.description,
    state: p.state,
    permissions: p.permissions,
    tools: p.sandbox ? p.sandbox.getTools().map((t: any) => t.name) : [],
    installedAt: p.installedAt,
    error: p.error,
  }));

  const stats = manager.getStats();

  return {
    plugins,
    total: stats.total,
    byState: stats.byState,
    totalTools: stats.totalTools,
  };
}

async function handleManagePlugin(args: Record<string, unknown>) {
  const manager = getPluginLifecycleManager();
  const pluginId = args.pluginId as string;
  const action = args.action as string;

  try {
    switch (action) {
      case 'enable': {
        const result = await manager.enable(pluginId);
        const plugin = manager.getPlugin(pluginId);
        return {
          success: result.success,
          pluginId,
          action: 'enable',
          state: plugin?.state,
          error: result.error,
        };
      }
      case 'disable': {
        manager.disable(pluginId);
        return { success: true, pluginId, action: 'disable', state: 'disabled' };
      }
      case 'uninstall': {
        manager.uninstall(pluginId);
        return { success: true, pluginId, action: 'uninstall', state: 'uninstalled' };
      }
      default:
        return { success: false, pluginId, error: `Unknown action: ${action}` };
    }
  } catch (err) {
    return {
      success: false,
      pluginId,
      action,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleInstallDomainPlugin(args: Record<string, unknown>) {
  const pluginName = args.plugin_name as string;
  // OVERCLAIMED ratchet fix: no actual plugin loading or registration happens.
  // The previous message claimed success with schema-mapper registration that never occurred.
  return {
    success: false,
    pluginId: pluginName,
    state: 'not_installed',
    message: `STUB: Domain plugin ${pluginName} installation is not yet implemented. No plugin loading, schema-mapper registration, or lifecycle manager call occurs. Use install_plugin for runtime-loaded plugins, or install domain plugins manually via package manager.`,
  };
}

interface DiscoveredPlugin {
  id: string;
  description: string;
  category: string;
  version?: string;
}

let _pluginRegistryCache: DiscoveredPlugin[] | null = null;

/**
 * Scan packages/plugins/* for package.json files and build a live plugin registry.
 * Cached per process (the on-disk plugin set is stable within a server lifetime).
 * Returns an empty registry with a distinct source when the directory is absent
 * (e.g. an unexpected CWD) instead of throwing.
 */
function scanPluginRegistry(): { entries: DiscoveredPlugin[]; source: string } {
  if (_pluginRegistryCache) return { entries: _pluginRegistryCache, source: 'filesystem-scan' };

  const pluginsDir = resolve(__dirname, '../../plugins');
  if (!existsSync(pluginsDir)) {
    return { entries: [], source: 'filesystem-not-found' };
  }

  const entries: DiscoveredPlugin[] = [];
  for (const dirent of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const pkgPath = join(pluginsDir, dirent.name, 'package.json');
    if (!existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
        name?: string;
        description?: string;
        version?: string;
        keywords?: string[];
      };
      const keywords = Array.isArray(pkg.keywords) ? pkg.keywords : [];
      const category = keywords.find((k) => k !== 'holoscript' && k !== 'plugin') ?? 'general';
      entries.push({
        id: pkg.name ?? `@holoscript/${dirent.name}`,
        description: pkg.description ?? `HoloScript plugin: ${dirent.name}`,
        category,
        version: pkg.version,
      });
    } catch {
      // Skip a single malformed package.json; keep scanning the rest (resilient).
    }
  }

  _pluginRegistryCache = entries;
  return { entries, source: 'filesystem-scan' };
}

async function handleDiscoverPlugins(args: Record<string, unknown>) {
  const query = ((args.query as string) || '').toLowerCase();
  const category = args.category as string | undefined;

  const { entries: registry, source } = scanPluginRegistry();

  const results = registry.filter((p) => {
    const matchesQuery =
      query === '' || p.id.toLowerCase().includes(query) || p.description.toLowerCase().includes(query);
    const matchesCategory = !category || p.category === category;
    return matchesQuery && matchesCategory;
  });

  return {
    success: true,
    query,
    count: results.length,
    plugins: results,
    registrySource: source,
    totalRegistryEntries: registry.length,
  };
}
