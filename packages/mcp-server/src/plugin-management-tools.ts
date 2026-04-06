/**
 * @holoscript/mcp-server — Plugin Management MCP Tools
 *
 * 3 tools for installing, listing, and managing plugins.
 *
 * Part of HoloScript v5.7 "Open Ecosystem".
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getPluginLifecycleManager,
  type InstallPluginOptions,
  type SandboxPermission,
  type PluginLifecycleState,
} from '@holoscript/core';

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
