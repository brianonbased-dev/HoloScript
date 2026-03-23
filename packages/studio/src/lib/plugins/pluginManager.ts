/**
 * Plugin Manager
 * Central registry and lifecycle management for HoloScript plugins
 */

import { create } from 'zustand';
import type { HoloScriptPlugin, PluginRegistryEntry, PluginManagerState } from './types';

// ── Plugin Storage ────────────────────────────────────────────────────────

const STORAGE_KEY = 'holoscript-plugins';

function loadPluginsFromStorage(): Map<string, PluginRegistryEntry> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return new Map();

    const data = JSON.parse(stored);
    return new Map(Object.entries(data));
  } catch (error) {
    console.error('Failed to load plugins from storage:', error);
    return new Map();
  }
}

function savePluginsToStorage(plugins: Map<string, PluginRegistryEntry>) {
  try {
    const data = Object.fromEntries(plugins.entries());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save plugins to storage:', error);
  }
}

// ── Plugin Manager Store ──────────────────────────────────────────────────

export const usePluginManager = create<PluginManagerState>((set, get) => ({
  plugins: loadPluginsFromStorage(),
  loading: false,
  error: null,

  // ── Register Plugin ─────────────────────────────────────────────────────

  registerPlugin: (plugin: HoloScriptPlugin) => {
    const { plugins } = get();
    const entry: PluginRegistryEntry = {
      plugin,
      enabled: false,
      installed: true,
      installedAt: Date.now(),
      source: 'local',
    };

    const newPlugins = new Map(plugins);
    newPlugins.set(plugin.metadata.id, entry);

    set({ plugins: newPlugins });
    savePluginsToStorage(newPlugins);

    // Call onInstall hook
    if (plugin.onInstall) {
      Promise.resolve(plugin.onInstall()).catch((err) => {
        console.error(`Plugin ${plugin.metadata.id} onInstall failed:`, err);
      });
    }
  },

  // ── Unregister Plugin ───────────────────────────────────────────────────

  unregisterPlugin: (id: string) => {
    const { plugins } = get();
    const entry = plugins.get(id);

    if (!entry) {
      console.warn(`Plugin ${id} not found`);
      return;
    }

    // Call onUninstall hook
    if (entry.plugin.onUninstall) {
      Promise.resolve(entry.plugin.onUninstall()).catch((err) => {
        console.error(`Plugin ${id} onUninstall failed:`, err);
      });
    }

    const newPlugins = new Map(plugins);
    newPlugins.delete(id);

    set({ plugins: newPlugins });
    savePluginsToStorage(newPlugins);
  },

  // ── Enable Plugin ───────────────────────────────────────────────────────

  enablePlugin: async (id: string) => {
    const { plugins } = get();
    const entry = plugins.get(id);

    if (!entry) {
      throw new Error(`Plugin ${id} not found`);
    }

    if (entry.enabled) {
      console.warn(`Plugin ${id} is already enabled`);
      return;
    }

    // Call onLoad hook
    try {
      if (entry.plugin.onLoad) {
        await entry.plugin.onLoad();
      }

      const newPlugins = new Map(plugins);
      newPlugins.set(id, {
        ...entry,
        enabled: true,
        enabledAt: Date.now(),
      });

      set({ plugins: newPlugins });
      savePluginsToStorage(newPlugins);
    } catch (error) {
      console.error(`Failed to enable plugin ${id}:`, error);
      throw error;
    }
  },

  // ── Disable Plugin ──────────────────────────────────────────────────────

  disablePlugin: async (id: string) => {
    const { plugins } = get();
    const entry = plugins.get(id);

    if (!entry) {
      throw new Error(`Plugin ${id} not found`);
    }

    if (!entry.enabled) {
      console.warn(`Plugin ${id} is already disabled`);
      return;
    }

    // Call onUnload hook
    try {
      if (entry.plugin.onUnload) {
        await entry.plugin.onUnload();
      }

      const newPlugins = new Map(plugins);
      newPlugins.set(id, {
        ...entry,
        enabled: false,
      });

      set({ plugins: newPlugins });
      savePluginsToStorage(newPlugins);
    } catch (error) {
      console.error(`Failed to disable plugin ${id}:`, error);
      throw error;
    }
  },

  // ── Install Plugin ──────────────────────────────────────────────────────

  installPlugin: async (source: string, type: 'npm' | 'url' | 'local') => {
    set({ loading: true, error: null });

    try {
      let plugin: HoloScriptPlugin;

      if (type === 'npm') {
        // Load plugin from npm package
        // In production, this would use dynamic import or fetch
        throw new Error('NPM plugin installation not yet implemented');
      } else if (type === 'url') {
        // Load plugin from URL
        const response = await fetch(source);
        if (!response.ok) {
          throw new Error(`Failed to fetch plugin from ${source}`);
        }
        const code = await response.text();
        // In production, this would safely evaluate the code
        // For now, we'll throw an error
        throw new Error('URL plugin installation not yet implemented');
      } else {
        // Local plugin (already loaded)
        throw new Error('Local plugin installation requires registerPlugin');
      }

      // Register the plugin
      get().registerPlugin(plugin);

      set({ loading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set({ loading: false, error: errorMessage });
      throw error;
    }
  },

  // ── Uninstall Plugin ────────────────────────────────────────────────────

  uninstallPlugin: async (id: string) => {
    const { plugins } = get();
    const entry = plugins.get(id);

    if (!entry) {
      throw new Error(`Plugin ${id} not found`);
    }

    // Disable first if enabled
    if (entry.enabled) {
      await get().disablePlugin(id);
    }

    // Unregister
    get().unregisterPlugin(id);
  },

  // ── Plugin Settings ─────────────────────────────────────────────────────

  updatePluginSettings: (id: string, settings: Record<string, any>) => {
    const { plugins } = get();
    const entry = plugins.get(id);

    if (!entry) {
      console.warn(`Plugin ${id} not found`);
      return;
    }

    const newPlugins = new Map(plugins);
    newPlugins.set(id, {
      ...entry,
      plugin: {
        ...entry.plugin,
        settings: {
          ...entry.plugin.settings,
          ...settings,
        },
      },
    });

    set({ plugins: newPlugins });
    savePluginsToStorage(newPlugins);
  },

  getPluginSettings: (id: string): Record<string, any> => {
    const { plugins } = get();
    const entry = plugins.get(id);

    if (!entry) {
      console.warn(`Plugin ${id} not found`);
      return {};
    }

    return entry.plugin.settings || {};
  },
}));

// ── Plugin Utilities ──────────────────────────────────────────────────────

/**
 * Get all enabled plugins
 */
export function getEnabledPlugins(): HoloScriptPlugin[] {
  const { plugins } = usePluginManager.getState();
  return Array.from(plugins.values())
    .filter((entry) => entry.enabled)
    .map((entry) => entry.plugin);
}

/**
 * Get plugin by ID
 */
export function getPlugin(id: string): HoloScriptPlugin | null {
  const { plugins } = usePluginManager.getState();
  const entry = plugins.get(id);
  return entry ? entry.plugin : null;
}

/**
 * Check if plugin is enabled
 */
export function isPluginEnabled(id: string): boolean {
  const { plugins } = usePluginManager.getState();
  const entry = plugins.get(id);
  return entry?.enabled ?? false;
}

/**
 * Get all custom node types from enabled plugins
 */
export function getCustomNodeTypes(editor: 'workflow' | 'behaviorTree') {
  const enabledPlugins = getEnabledPlugins();
  const nodeTypes = enabledPlugins.flatMap((plugin) => plugin.nodeTypes?.[editor] || []);
  return nodeTypes;
}

/**
 * Get all custom panels from enabled plugins
 */
export function getCustomPanels() {
  const enabledPlugins = getEnabledPlugins();
  return enabledPlugins.flatMap((plugin) => plugin.panels || []);
}

/**
 * Get all custom toolbar buttons from enabled plugins
 */
export function getCustomToolbarButtons() {
  const enabledPlugins = getEnabledPlugins();
  return enabledPlugins.flatMap((plugin) => plugin.toolbarButtons || []);
}

/**
 * Get all custom MCP servers from enabled plugins
 */
export function getCustomMCPServers() {
  const enabledPlugins = getEnabledPlugins();
  return enabledPlugins.flatMap((plugin) => plugin.mcpServers || []);
}

/**
 * Get all custom keyboard shortcuts from enabled plugins
 */
export function getCustomKeyboardShortcuts() {
  const enabledPlugins = getEnabledPlugins();
  return enabledPlugins.flatMap((plugin) => plugin.keyboardShortcuts || []);
}

/**
 * Auto-enable plugins marked for auto-enable on startup
 */
export async function initializePlugins() {
  const { plugins, enablePlugin } = usePluginManager.getState();

  for (const [id, entry] of plugins.entries()) {
    if (entry.installed && !entry.enabled) {
      // Check if plugin should be auto-enabled (saved state)
      // For now, we'll skip auto-enable to avoid conflicts
      // In production, you might want to restore the enabled state
      continue;
    }
  }
}
