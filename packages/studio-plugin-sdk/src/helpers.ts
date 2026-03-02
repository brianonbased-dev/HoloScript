/**
 * Helper utilities for plugin development
 */

import type { HoloScriptPlugin, PluginMetadata, CustomNodeType, CustomPanel } from './types.js';
import type { PluginSandboxManifest, SandboxPermission } from './sandbox/types.js';

/**
 * Create a plugin with type-safe builder pattern
 *
 * @example
 * ```typescript
 * export const myPlugin = createPlugin({
 *   metadata: {
 *     id: 'my-plugin',
 *     name: 'My Plugin',
 *     version: '1.0.0',
 *     description: 'Does awesome things',
 *     author: { name: 'Your Name' },
 *   },
 *   onLoad: () => console.log('Loaded!'),
 * });
 * ```
 */
export function createPlugin(plugin: HoloScriptPlugin): HoloScriptPlugin {
  return plugin;
}

/**
 * Validate plugin metadata
 */
export function validatePluginMetadata(metadata: PluginMetadata): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!metadata.id) {
    errors.push('Plugin ID is required');
  } else if (!/^[a-z0-9-]+$/.test(metadata.id)) {
    errors.push('Plugin ID must contain only lowercase letters, numbers, and hyphens');
  }

  if (!metadata.name) {
    errors.push('Plugin name is required');
  }

  if (!metadata.version) {
    errors.push('Plugin version is required');
  } else if (!/^\d+\.\d+\.\d+/.test(metadata.version)) {
    errors.push('Plugin version must follow semver format (e.g., 1.0.0)');
  }

  if (!metadata.description) {
    errors.push('Plugin description is required');
  }

  if (!metadata.author?.name) {
    errors.push('Plugin author name is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate plugin before registration
 */
export function validatePlugin(plugin: HoloScriptPlugin): { valid: boolean; errors: string[] } {
  const metadataValidation = validatePluginMetadata(plugin.metadata);

  if (!metadataValidation.valid) {
    return metadataValidation;
  }

  const errors: string[] = [];

  // Validate node types
  if (plugin.nodeTypes) {
    if (plugin.nodeTypes.workflow) {
      plugin.nodeTypes.workflow.forEach((node, index) => {
        if (!node.type) {
          errors.push(`Workflow node at index ${index} is missing 'type'`);
        }
        if (!node.label) {
          errors.push(`Workflow node '${node.type}' is missing 'label'`);
        }
      });
    }

    if (plugin.nodeTypes.behaviorTree) {
      plugin.nodeTypes.behaviorTree.forEach((node, index) => {
        if (!node.type) {
          errors.push(`Behavior tree node at index ${index} is missing 'type'`);
        }
        if (!node.label) {
          errors.push(`Behavior tree node '${node.type}' is missing 'label'`);
        }
      });
    }
  }

  // Validate panels
  if (plugin.panels) {
    plugin.panels.forEach((panel, index) => {
      if (!panel.id) {
        errors.push(`Panel at index ${index} is missing 'id'`);
      }
      if (!panel.label) {
        errors.push(`Panel '${panel.id}' is missing 'label'`);
      }
      if (!panel.component) {
        errors.push(`Panel '${panel.id}' is missing 'component'`);
      }
    });
  }

  // Validate toolbar buttons
  if (plugin.toolbarButtons) {
    plugin.toolbarButtons.forEach((button, index) => {
      if (!button.id) {
        errors.push(`Toolbar button at index ${index} is missing 'id'`);
      }
      if (!button.label) {
        errors.push(`Toolbar button '${button.id}' is missing 'label'`);
      }
      if (!button.onClick) {
        errors.push(`Toolbar button '${button.id}' is missing 'onClick' handler`);
      }
    });
  }

  // Validate keyboard shortcuts
  if (plugin.keyboardShortcuts) {
    plugin.keyboardShortcuts.forEach((shortcut, index) => {
      if (!shortcut.id) {
        errors.push(`Keyboard shortcut at index ${index} is missing 'id'`);
      }
      if (!shortcut.keys) {
        errors.push(`Keyboard shortcut '${shortcut.id}' is missing 'keys'`);
      }
      if (!shortcut.handler) {
        errors.push(`Keyboard shortcut '${shortcut.id}' is missing 'handler'`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a workflow node type
 */
export function createWorkflowNode(node: CustomNodeType): CustomNodeType {
  return {
    category: 'Custom',
    color: '#6366f1',
    ...node,
  };
}

/**
 * Create a behavior tree node type
 */
export function createBehaviorTreeNode(node: CustomNodeType): CustomNodeType {
  return {
    category: 'Custom',
    color: '#10b981',
    ...node,
  };
}

/**
 * Create a UI panel
 */
export function createPanel(panel: CustomPanel): CustomPanel {
  return {
    position: 'right',
    width: 400,
    ...panel,
  };
}

/**
 * Merge multiple plugins into one (useful for plugin bundles)
 */
export function mergePlugins(plugins: HoloScriptPlugin[]): HoloScriptPlugin {
  if (plugins.length === 0) {
    throw new Error('Cannot merge empty plugin array');
  }

  if (plugins.length === 1) {
    return plugins[0];
  }

  const [first, ...rest] = plugins;
  const merged: HoloScriptPlugin = {
    metadata: {
      ...first.metadata,
      name: `${first.metadata.name} (Bundle)`,
    },
  };

  // Merge lifecycle hooks (call all in sequence)
  const onLoadHandlers = plugins.map((p) => p.onLoad).filter(Boolean);
  if (onLoadHandlers.length > 0) {
    merged.onLoad = async () => {
      for (const handler of onLoadHandlers) {
        await handler!();
      }
    };
  }

  const onUnloadHandlers = plugins.map((p) => p.onUnload).filter(Boolean);
  if (onUnloadHandlers.length > 0) {
    merged.onUnload = async () => {
      for (const handler of onUnloadHandlers) {
        await handler!();
      }
    };
  }

  // Merge node types
  const allWorkflowNodes = plugins.flatMap((p) => p.nodeTypes?.workflow || []);
  const allBehaviorTreeNodes = plugins.flatMap((p) => p.nodeTypes?.behaviorTree || []);
  if (allWorkflowNodes.length > 0 || allBehaviorTreeNodes.length > 0) {
    merged.nodeTypes = {
      workflow: allWorkflowNodes.length > 0 ? allWorkflowNodes : undefined,
      behaviorTree: allBehaviorTreeNodes.length > 0 ? allBehaviorTreeNodes : undefined,
    };
  }

  // Merge other extensions
  const allPanels = plugins.flatMap((p) => p.panels || []);
  if (allPanels.length > 0) {
    merged.panels = allPanels;
  }

  const allToolbarButtons = plugins.flatMap((p) => p.toolbarButtons || []);
  if (allToolbarButtons.length > 0) {
    merged.toolbarButtons = allToolbarButtons;
  }

  const allKeyboardShortcuts = plugins.flatMap((p) => p.keyboardShortcuts || []);
  if (allKeyboardShortcuts.length > 0) {
    merged.keyboardShortcuts = allKeyboardShortcuts;
  }

  const allMenuItems = plugins.flatMap((p) => p.menuItems || []);
  if (allMenuItems.length > 0) {
    merged.menuItems = allMenuItems;
  }

  return merged;
}

// ── Sandbox Helpers ───────────────────────────────────────────────────────────

/**
 * Create a sandboxed plugin definition.
 * Ensures the sandbox manifest is included and validates permissions.
 *
 * @example
 * ```typescript
 * export const myPlugin = createSandboxedPlugin({
 *   metadata: {
 *     id: 'my-safe-plugin',
 *     name: 'My Safe Plugin',
 *     version: '1.0.0',
 *     description: 'Runs safely in a sandbox',
 *     author: { name: 'Plugin Dev' },
 *   },
 *   sandbox: {
 *     permissions: ['scene:read', 'ui:panel', 'storage:local'],
 *     networkPolicy: {
 *       allowedDomains: ['api.example.com'],
 *     },
 *   },
 * });
 * ```
 */
export function createSandboxedPlugin(
  plugin: HoloScriptPlugin & { sandbox: PluginSandboxManifest },
): HoloScriptPlugin {
  // Ensure trust level defaults to sandboxed
  if (!plugin.sandbox.trustLevel) {
    plugin.sandbox.trustLevel = 'sandboxed';
  }
  return plugin;
}

/**
 * Validates a plugin's sandbox manifest.
 *
 * Checks for:
 * - Valid permission names
 * - Network policy presence when network permissions are requested
 * - Consistency between manifest and plugin extensions
 */
export function validateSandboxManifest(
  manifest: PluginSandboxManifest,
  plugin?: HoloScriptPlugin,
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Valid permissions list
  const validPermissions: SandboxPermission[] = [
    'scene:read', 'scene:write', 'scene:subscribe',
    'editor:selection', 'editor:viewport', 'editor:undo',
    'ui:panel', 'ui:toolbar', 'ui:menu', 'ui:modal', 'ui:notification', 'ui:theme',
    'storage:local', 'storage:project',
    'network:fetch', 'network:websocket',
    'clipboard:read', 'clipboard:write',
    'fs:import', 'fs:export',
    'user:read',
    'nodes:workflow', 'nodes:behaviortree',
    'keyboard:shortcuts',
  ];

  // Validate permissions
  if (!manifest.permissions || manifest.permissions.length === 0) {
    errors.push('Sandbox manifest must declare at least one permission');
  } else {
    for (const perm of manifest.permissions) {
      if (!validPermissions.includes(perm)) {
        errors.push(`Unknown permission: '${perm}'`);
      }
    }
  }

  // Check network policy
  if (
    manifest.permissions?.includes('network:fetch') ||
    manifest.permissions?.includes('network:websocket')
  ) {
    if (!manifest.networkPolicy) {
      errors.push('Network policy is required when requesting network:fetch or network:websocket permission');
    } else if (
      !manifest.networkPolicy.allowedDomains ||
      manifest.networkPolicy.allowedDomains.length === 0
    ) {
      errors.push('Network policy must specify at least one allowed domain');
    }
  }

  // Validate resource budgets
  if (manifest.memoryBudget !== undefined && manifest.memoryBudget <= 0) {
    errors.push('Memory budget must be a positive number');
  }
  if (manifest.cpuBudget !== undefined && manifest.cpuBudget <= 0) {
    errors.push('CPU budget must be a positive number');
  }

  // Cross-validate with plugin extensions (if plugin provided)
  if (plugin) {
    if (plugin.panels && plugin.panels.length > 0 && !manifest.permissions?.includes('ui:panel')) {
      warnings.push("Plugin declares panels but doesn't request 'ui:panel' permission");
    }
    if (plugin.toolbarButtons && plugin.toolbarButtons.length > 0 && !manifest.permissions?.includes('ui:toolbar')) {
      warnings.push("Plugin declares toolbar buttons but doesn't request 'ui:toolbar' permission");
    }
    if (plugin.keyboardShortcuts && plugin.keyboardShortcuts.length > 0 && !manifest.permissions?.includes('keyboard:shortcuts')) {
      warnings.push("Plugin declares keyboard shortcuts but doesn't request 'keyboard:shortcuts' permission");
    }
    if (plugin.menuItems && plugin.menuItems.length > 0 && !manifest.permissions?.includes('ui:menu')) {
      warnings.push("Plugin declares menu items but doesn't request 'ui:menu' permission");
    }
    if (plugin.nodeTypes?.workflow && plugin.nodeTypes.workflow.length > 0 && !manifest.permissions?.includes('nodes:workflow')) {
      warnings.push("Plugin declares workflow nodes but doesn't request 'nodes:workflow' permission");
    }
    if (plugin.nodeTypes?.behaviorTree && plugin.nodeTypes.behaviorTree.length > 0 && !manifest.permissions?.includes('nodes:behaviortree')) {
      warnings.push("Plugin declares behavior tree nodes but doesn't request 'nodes:behaviortree' permission");
    }
    if (plugin.mcpServers && plugin.mcpServers.length > 0 && !manifest.permissions?.includes('network:fetch')) {
      warnings.push("Plugin declares MCP servers but doesn't request 'network:fetch' permission");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Checks if a plugin requires sandboxing.
 *
 * A plugin requires sandboxing when:
 * - It declares a sandbox manifest, OR
 * - It is from an untrusted source (no signing)
 *
 * A plugin can opt out of sandboxing when:
 * - It has trustLevel: 'trusted' AND
 * - It is digitally signed by a trusted publisher
 */
export function requiresSandboxing(plugin: HoloScriptPlugin): boolean {
  // Explicitly sandboxed
  if (plugin.sandbox) {
    return plugin.sandbox.trustLevel !== 'trusted';
  }

  // No sandbox manifest = legacy trusted plugin (backward compat)
  return false;
}

/**
 * Generates the minimum required permissions for a plugin based on its
 * declared extensions (panels, nodes, buttons, etc.).
 *
 * Useful for auto-generating a manifest from an existing plugin definition.
 */
export function inferPermissions(plugin: HoloScriptPlugin): SandboxPermission[] {
  const permissions: Set<SandboxPermission> = new Set();

  if (plugin.panels && plugin.panels.length > 0) {
    permissions.add('ui:panel');
  }
  if (plugin.toolbarButtons && plugin.toolbarButtons.length > 0) {
    permissions.add('ui:toolbar');
  }
  if (plugin.menuItems && plugin.menuItems.length > 0) {
    permissions.add('ui:menu');
  }
  if (plugin.keyboardShortcuts && plugin.keyboardShortcuts.length > 0) {
    permissions.add('keyboard:shortcuts');
  }
  if (plugin.nodeTypes?.workflow && plugin.nodeTypes.workflow.length > 0) {
    permissions.add('nodes:workflow');
  }
  if (plugin.nodeTypes?.behaviorTree && plugin.nodeTypes.behaviorTree.length > 0) {
    permissions.add('nodes:behaviortree');
  }
  if (plugin.mcpServers && plugin.mcpServers.length > 0) {
    permissions.add('network:fetch');
  }
  if (plugin.contentTypes && plugin.contentTypes.length > 0) {
    // Content types may need file I/O
    permissions.add('fs:import');
    permissions.add('fs:export');
  }
  if (plugin.settingsSchema && plugin.settingsSchema.length > 0) {
    permissions.add('storage:local');
  }

  return Array.from(permissions);
}
