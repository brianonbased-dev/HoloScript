/**
 * Plugin type definitions for HoloScript Studio
 *
 * These types define the plugin API for extending Studio with custom:
 * - Workflow/Behavior Tree nodes
 * - UI panels and modals
 * - Toolbar buttons
 * - Keyboard shortcuts
 * - Menu items
 * - MCP servers
 * - Content types
 */

import type { ComponentType } from 'react';

// ── Plugin Metadata ───────────────────────────────────────────────────────────

export interface PluginMetadata {
  /** Unique plugin identifier (e.g., 'holoscript-analytics-dashboard') */
  id: string;

  /** Display name */
  name: string;

  /** Semantic version (e.g., '1.0.0') */
  version: string;

  /** Brief description of plugin functionality */
  description: string;

  /** Author information */
  author: {
    name: string;
    email?: string;
    url?: string;
  };

  /** Plugin homepage URL */
  homepage?: string;

  /** License identifier (SPDX format, e.g., 'MIT') */
  license?: string;

  /** Lucide icon name (e.g., 'BarChart2', 'Zap') */
  icon?: string;

  /** Keywords for search/discovery */
  keywords?: string[];

  /** Minimum Studio version required (semver) */
  minStudioVersion?: string;
}

// ── Plugin Lifecycle ──────────────────────────────────────────────────────────

export interface PluginLifecycle {
  /** Called when plugin is enabled (first time or after restart) */
  onLoad?: () => void | Promise<void>;

  /** Called when plugin is disabled */
  onUnload?: () => void | Promise<void>;

  /** Called when plugin is installed (one-time setup) */
  onInstall?: () => void | Promise<void>;

  /** Called when plugin is uninstalled (cleanup) */
  onUninstall?: () => void | Promise<void>;
}

// ── Plugin Settings ───────────────────────────────────────────────────────────

export interface PluginSetting {
  /** Setting key (storage identifier) */
  key: string;

  /** Display label */
  label: string;

  /** Input type */
  type: 'text' | 'number' | 'boolean' | 'select';

  /** Detailed description/help text */
  description?: string;

  /** Default value */
  defaultValue?: any;

  /** Required setting (must be configured before use) */
  required?: boolean;

  /** For 'select' type: available options */
  options?: Array<{ label: string; value: string }>;

  /** For 'number' type: min/max constraints */
  min?: number;
  max?: number;

  /** Validation pattern (regex string) */
  pattern?: string;
}

export interface PluginConfig {
  /** Settings schema (UI auto-generated from this) */
  settingsSchema?: PluginSetting[];

  /** Current settings values */
  settings?: Record<string, any>;
}

// ── Custom Extensions ─────────────────────────────────────────────────────────

export interface CustomNodeType {
  /** Node type identifier */
  type: string;

  /** Display label */
  label: string;

  /** Category for node palette grouping */
  category?: string;

  /** Icon (Lucide icon name) */
  icon?: string;

  /** Color (hex or CSS color) */
  color?: string;

  /** Node description/help text */
  description?: string;

  /** Input port definitions */
  inputs?: Array<{ id: string; label: string; type?: string }>;

  /** Output port definitions */
  outputs?: Array<{ id: string; label: string; type?: string }>;

  /** Default configuration */
  defaultConfig?: Record<string, any>;

  /** React component for custom node UI (optional) */
  component?: ComponentType<any>;
}

export interface CustomPanel {
  /** Panel identifier */
  id: string;

  /** Display label */
  label: string;

  /** Icon (Lucide icon name) */
  icon?: string;

  /** Panel position in UI */
  position?: 'left' | 'right' | 'bottom' | 'modal';

  /** Default width (pixels) */
  width?: number;

  /** Default height (pixels, for bottom panels) */
  height?: number;

  /** React component for panel content */
  component: ComponentType<any>;

  /** Keyboard shortcut to toggle panel (e.g., 'Ctrl+Shift+P') */
  shortcut?: string;
}

export interface CustomToolbarButton {
  /** Button identifier */
  id: string;

  /** Display label */
  label: string;

  /** Icon (Lucide icon name) */
  icon?: string;

  /** Tooltip text */
  tooltip?: string;

  /** Button position in toolbar */
  position?: 'left' | 'center' | 'right';

  /** Click handler */
  onClick: () => void;

  /** Button color theme */
  color?: 'default' | 'accent' | 'success' | 'warning' | 'error';
}

export interface CustomKeyboardShortcut {
  /** Shortcut identifier */
  id: string;

  /** Key combination (e.g., 'Ctrl+Shift+P', 'Alt+N') */
  keys: string;

  /** Shortcut description */
  description: string;

  /** Handler function */
  handler: () => void;

  /** Scope (where shortcut is active) */
  scope?: 'global' | 'editor' | 'panel';
}

export interface CustomMenuItem {
  /** Menu item identifier */
  id: string;

  /** Display label */
  label: string;

  /** Menu path (e.g., 'File/Export/My Format') */
  path: string;

  /** Icon (Lucide icon name) */
  icon?: string;

  /** Click handler */
  onClick: () => void;

  /** Keyboard shortcut hint */
  shortcut?: string;
}

export interface CustomContentType {
  /** Content type identifier */
  type: string;

  /** Display label */
  label: string;

  /** File extension (without dot, e.g., 'hsplug') */
  extension: string;

  /** Icon (Lucide icon name) */
  icon?: string;

  /** Category for marketplace grouping */
  category?: string;

  /** Import handler (parse file) */
  import?: (file: File) => Promise<any>;

  /** Export handler (serialize to file) */
  export?: (data: any) => Promise<Blob>;
}

export interface CustomMCPServer {
  /** Server identifier */
  id: string;

  /** Display name */
  name: string;

  /** Server URL */
  url: string;

  /** Optional API key */
  apiKey?: string;

  /** Server description */
  description?: string;

  /** Auto-connect on plugin load */
  autoConnect?: boolean;
}

// ── Main Plugin Interface ─────────────────────────────────────────────────────

export interface HoloScriptPlugin extends PluginLifecycle, PluginConfig {
  /** Plugin metadata (required) */
  metadata: PluginMetadata;

  /** Custom workflow/behavior tree nodes */
  nodeTypes?: {
    workflow?: CustomNodeType[];
    behaviorTree?: CustomNodeType[];
  };

  /** Custom UI panels */
  panels?: CustomPanel[];

  /** Custom toolbar buttons */
  toolbarButtons?: CustomToolbarButton[];

  /** Custom content types for marketplace */
  contentTypes?: CustomContentType[];

  /** Custom MCP servers */
  mcpServers?: CustomMCPServer[];

  /** Custom keyboard shortcuts */
  keyboardShortcuts?: CustomKeyboardShortcut[];

  /** Custom menu items */
  menuItems?: CustomMenuItem[];
}

// ── Plugin Registry Entry ─────────────────────────────────────────────────────

export interface PluginRegistryEntry {
  plugin: HoloScriptPlugin;
  enabled: boolean;
  installedAt: number;
  enabledAt?: number;
}
