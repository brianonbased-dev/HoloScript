/**
 * Plugin System Types
 * Extensible plugin architecture for HoloScript Studio
 */

import type { ReactNode } from 'react';

// ContentType enum for marketplace content
type ContentType =
  | 'asset'
  | 'template'
  | 'component'
  | 'scene'
  | 'behavior'
  | 'plugin'
  | 'shader'
  | 'material'
  | 'texture'
  | 'model'
  | 'audio'
  | 'script';

// ── Plugin Metadata ───────────────────────────────────────────────────────

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  icon?: string; // Lucide icon name or URL
}

// ── Plugin Lifecycle Hooks ────────────────────────────────────────────────

export interface PluginLifecycle {
  /**
   * Called when plugin is loaded/enabled
   */
  onLoad?: () => void | Promise<void>;

  /**
   * Called when plugin is unloaded/disabled
   */
  onUnload?: () => void | Promise<void>;

  /**
   * Called when plugin is installed
   */
  onInstall?: () => void | Promise<void>;

  /**
   * Called when plugin is uninstalled
   */
  onUninstall?: () => void | Promise<void>;
}

// ── Plugin Extensions ─────────────────────────────────────────────────────

/**
 * Custom node type for workflow/behavior tree editors
 */
export interface CustomNodeType {
  type: string;
  label: string;
  description: string;
  icon?: string; // Lucide icon name
  category?: string;
  color?: string;
  inputs?: Array<{ id: string; label: string; type: string }>;
  outputs?: Array<{ id: string; label: string; type: string }>;
  settings?: Record<string, any>;
  execute?: (inputs: Record<string, any>, context: any) => any | Promise<any>;
}

/**
 * Custom panel/sidebar component
 */
export interface CustomPanel {
  id: string;
  label: string;
  icon?: string; // Lucide icon name
  position?: 'left' | 'right' | 'bottom';
  defaultOpen?: boolean;
  component: React.ComponentType<any>;
}

/**
 * Custom toolbar button
 */
export interface CustomToolbarButton {
  id: string;
  label: string;
  icon: string; // Lucide icon name
  tooltip?: string;
  position?: 'left' | 'right';
  onClick: () => void | Promise<void>;
}

/**
 * Custom content type for marketplace
 */
export interface CustomContentType {
  type: ContentType;
  label: string;
  description: string;
  icon: string; // Lucide icon name
  fileExtension: string;
  category: string;
  handler?: {
    onDownload?: (content: any) => void | Promise<void>;
    onInstall?: (content: any) => void | Promise<void>;
    onPreview?: (content: any) => ReactNode;
  };
}

/**
 * Custom MCP server configuration
 */
export interface CustomMCPServer {
  name: string;
  url: string;
  description?: string;
  icon?: string;
  apiKey?: string;
  healthCheck?: string;
}

/**
 * Custom keyboard shortcut
 */
export interface CustomKeyboardShortcut {
  id: string;
  key: string; // e.g., "ctrl+shift+p"
  description: string;
  handler: () => void | Promise<void>;
}

/**
 * Custom menu item
 */
export interface CustomMenuItem {
  id: string;
  label: string;
  icon?: string;
  submenu?: CustomMenuItem[];
  onClick?: () => void | Promise<void>;
  separator?: boolean;
}

// ── Plugin Configuration ──────────────────────────────────────────────────

export interface PluginConfig {
  /**
   * Plugin-specific settings (stored in localStorage)
   */
  settings?: Record<string, any>;

  /**
   * Default settings schema
   */
  settingsSchema?: Array<{
    key: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'select' | 'textarea';
    defaultValue?: any;
    options?: Array<{ label: string; value: any }>;
    description?: string;
    required?: boolean;
  }>;
}

// ── Main Plugin Interface ─────────────────────────────────────────────────

export interface HoloScriptPlugin extends PluginLifecycle, PluginConfig {
  /**
   * Plugin metadata
   */
  metadata: PluginMetadata;

  /**
   * Custom node types for orchestration
   */
  nodeTypes?: {
    workflow?: CustomNodeType[];
    behaviorTree?: CustomNodeType[];
  };

  /**
   * Custom UI panels
   */
  panels?: CustomPanel[];

  /**
   * Custom toolbar buttons
   */
  toolbarButtons?: CustomToolbarButton[];

  /**
   * Custom content types
   */
  contentTypes?: CustomContentType[];

  /**
   * Custom MCP servers
   */
  mcpServers?: CustomMCPServer[];

  /**
   * Custom keyboard shortcuts
   */
  keyboardShortcuts?: CustomKeyboardShortcut[];

  /**
   * Custom menu items
   */
  menuItems?: CustomMenuItem[];
}

// ── Plugin Registry ───────────────────────────────────────────────────────

export interface PluginRegistryEntry {
  plugin: HoloScriptPlugin;
  enabled: boolean;
  installed: boolean;
  installedAt?: number;
  enabledAt?: number;
  source?: 'npm' | 'url' | 'local';
  sourceUrl?: string;
}

export interface PluginRegistry {
  plugins: Map<string, PluginRegistryEntry>;
}

// ── Plugin Manager State ──────────────────────────────────────────────────

export interface PluginManagerState extends PluginRegistry {
  loading: boolean;
  error: string | null;

  // Actions
  registerPlugin: (plugin: HoloScriptPlugin) => void;
  unregisterPlugin: (id: string) => void;
  enablePlugin: (id: string) => Promise<void>;
  disablePlugin: (id: string) => Promise<void>;
  installPlugin: (source: string, type: 'npm' | 'url' | 'local') => Promise<void>;
  uninstallPlugin: (id: string) => Promise<void>;
  updatePluginSettings: (id: string, settings: Record<string, any>) => void;
  getPluginSettings: (id: string) => Record<string, any>;
}
