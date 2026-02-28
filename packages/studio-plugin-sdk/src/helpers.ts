/**
 * Helper utilities for plugin development
 */

import type { HoloScriptPlugin, PluginMetadata, CustomNodeType, CustomPanel } from './types.js';

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
