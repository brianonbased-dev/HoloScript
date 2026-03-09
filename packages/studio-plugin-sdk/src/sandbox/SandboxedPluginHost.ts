/**
 * SandboxedPluginHost - Top-level manager for all sandboxed plugins
 *
 * This is the main integration point between HoloScript Studio and
 * the plugin sandbox system. It manages the complete lifecycle of
 * sandboxed plugins: installation, loading, running, and uninstalling.
 *
 * The host maintains a registry of all installed plugins, their
 * sandbox instances, and their bridges. It provides a unified API
 * for Studio to interact with all plugins through.
 *
 * @module @holoscript/studio-plugin-sdk/sandbox
 *
 * @example
 * ```typescript
 * // In Studio initialization
 * const pluginHost = new SandboxedPluginHost({
 *   onAPICall: (pluginId, ns, method, args) => studioAPI.dispatch(ns, method, args),
 *   onStorage: (pluginId, scope, op, key, val) => storageService.operate(pluginId, scope, op, key, val),
 *   onFetch: async (pluginId, url, opts) => {
 *     const res = await fetch(url, opts);
 *     return { status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() };
 *   },
 * });
 *
 * // Load a plugin
 * await pluginHost.loadPlugin({
 *   pluginId: 'analytics-dashboard',
 *   pluginUrl: 'https://cdn.holoscript.dev/plugins/analytics/1.0.0/index.js',
 *   manifest: {
 *     permissions: ['scene:read', 'ui:panel', 'storage:local'],
 *   },
 *   hasUI: true,
 *   container: document.getElementById('plugin-panel-analytics')!,
 * });
 *
 * // Send events to plugins
 * pluginHost.broadcastEvent('scene', 'nodesChanged', { changedNodeIds: ['node-1'] });
 *
 * // Unload a plugin
 * await pluginHost.unloadPlugin('analytics-dashboard');
 *
 * // Shutdown all plugins (on Studio close)
 * await pluginHost.shutdown();
 * ```
 */

import type {
  SandboxCreateOptions,
  SandboxState,
  SandboxHealthMetrics,
  SandboxAuditEntry,
  SandboxPermission,
} from './types.js';
import { PluginSandbox } from './PluginSandbox.js';
import { PluginBridge } from './PluginBridge.js';
import type {
  APIHandler,
  StorageHandler,
  FetchHandler,
  RegisterHandler,
  PluginBridgeOptions,
} from './PluginBridge.js';

/**
 * Configuration for the SandboxedPluginHost.
 */
export interface SandboxedPluginHostOptions {
  /** Handler for API calls from plugins */
  onAPICall?: APIHandler;
  /** Handler for plugin storage operations */
  onStorage?: StorageHandler;
  /** Handler for proxied network requests */
  onFetch?: FetchHandler;
  /** Handler for plugin registrations (panels, nodes, etc.) */
  onRegister?: RegisterHandler;
  /** Handler for plugin log messages */
  onLog?: (pluginId: string, level: string, message: string, data?: unknown) => void;
  /** Handler for plugin errors */
  onError?: (pluginId: string, code: string, message: string, stack?: string) => void;
  /** Maximum number of concurrent sandboxed plugins (default: 20) */
  maxPlugins?: number;
  /** Default initialization timeout in ms (default: 10000) */
  defaultInitTimeout?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Resource monitoring interval in ms (default: 30000) */
  monitorInterval?: number;
}

/**
 * Represents a loaded plugin with its sandbox and bridge.
 */
interface LoadedPlugin {
  sandbox: PluginSandbox;
  bridge: PluginBridge;
  loadedAt: number;
  options: SandboxCreateOptions;
}

/**
 * Summary of all plugins' health status.
 */
export interface PluginHostHealthSummary {
  /** Total loaded plugins */
  totalPlugins: number;
  /** Plugins by state */
  byState: Record<SandboxState, number>;
  /** Plugins with permission violations */
  pluginsWithViolations: string[];
  /** Total audit entries across all plugins */
  totalAuditEntries: number;
  /** Per-plugin metrics */
  plugins: Record<string, SandboxHealthMetrics>;
}

/**
 * SandboxedPluginHost orchestrates all sandboxed plugins in the Studio.
 *
 * Responsibilities:
 * - Plugin lifecycle management (load, enable, disable, unload)
 * - Bridge creation and management
 * - Event broadcasting to subscribed plugins
 * - Health monitoring and resource enforcement
 * - Centralized audit logging
 */
export class SandboxedPluginHost {
  private readonly options: Required<SandboxedPluginHostOptions>;
  private readonly plugins: Map<string, LoadedPlugin> = new Map();
  private monitorTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SandboxedPluginHostOptions = {}) {
    this.options = {
      onAPICall:
        options.onAPICall ??
        (async () => {
          throw new Error('No API handler');
        }),
      onStorage:
        options.onStorage ??
        (async () => {
          throw new Error('No storage handler');
        }),
      onFetch:
        options.onFetch ??
        (async () => {
          throw new Error('No fetch handler');
        }),
      onRegister:
        options.onRegister ??
        (async () => {
          /* no-op default */
        }),
      onLog:
        options.onLog ??
        ((pluginId, level, message) => {
          console.log(`[Plugin:${pluginId}] [${level}]`, message);
        }),
      onError:
        options.onError ??
        ((pluginId, code, message) => {
          console.error(`[Plugin:${pluginId}] Error ${code}:`, message);
        }),
      maxPlugins: options.maxPlugins ?? 20,
      defaultInitTimeout: options.defaultInitTimeout ?? 10000,
      debug: options.debug ?? false,
      monitorInterval: options.monitorInterval ?? 30000,
    };

    // Start health monitoring
    this.startMonitoring();
  }

  // ── Plugin Lifecycle ────────────────────────────────────────────────────

  /**
   * Loads and initializes a sandboxed plugin.
   *
   * @param options - Plugin sandbox creation options
   * @throws Error if max plugins exceeded or plugin already loaded
   */
  public async loadPlugin(options: SandboxCreateOptions): Promise<void> {
    const { pluginId } = options;

    // Check limits
    if (this.plugins.size >= this.options.maxPlugins) {
      throw new Error(
        `Cannot load plugin ${pluginId}: maximum plugin limit (${this.options.maxPlugins}) reached`
      );
    }

    // Check for duplicate
    if (this.plugins.has(pluginId)) {
      throw new Error(`Plugin ${pluginId} is already loaded`);
    }

    // Apply defaults
    const sandboxOptions: SandboxCreateOptions = {
      ...options,
      initTimeout: options.initTimeout ?? this.options.defaultInitTimeout,
      debug: options.debug ?? this.options.debug,
    };

    // Create sandbox
    const sandbox = new PluginSandbox(sandboxOptions);

    // Create bridge with handlers
    const bridgeOptions: PluginBridgeOptions = {
      onAPICall: this.options.onAPICall,
      onStorage: this.options.onStorage,
      onFetch: this.options.onFetch,
      onRegister: this.options.onRegister,
      onLog: this.options.onLog,
      onError: this.options.onError,
      debug: this.options.debug,
    };
    const bridge = new PluginBridge(sandbox, bridgeOptions);

    // Register the plugin
    this.plugins.set(pluginId, {
      sandbox,
      bridge,
      loadedAt: Date.now(),
      options: sandboxOptions,
    });

    try {
      // Initialize sandbox (creates iframe, waits for plugin ready)
      await sandbox.create();

      // Connect bridge to sandbox message stream
      bridge.connect();

      this.log('info', `Plugin ${pluginId} loaded and connected`);
    } catch (err) {
      // Clean up on failure
      this.plugins.delete(pluginId);
      bridge.disconnect();
      sandbox.terminate();
      throw err;
    }
  }

  /**
   * Unloads a plugin gracefully.
   *
   * @param pluginId - ID of the plugin to unload
   * @param reason - Reason for unloading
   */
  public async unloadPlugin(
    pluginId: string,
    reason:
      | 'user-disabled'
      | 'user-uninstalled'
      | 'error'
      | 'resource-limit'
      | 'studio-closing' = 'user-disabled'
  ): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} is not loaded`);
    }

    // Disconnect bridge first
    plugin.bridge.disconnect();

    // Destroy sandbox (sends shutdown message, waits for grace period)
    await plugin.sandbox.destroy(reason);

    // Remove from registry
    this.plugins.delete(pluginId);

    this.log('info', `Plugin ${pluginId} unloaded (reason: ${reason})`);
  }

  /**
   * Forcefully terminates a plugin without grace period.
   * Use when a plugin is unresponsive or consuming excessive resources.
   */
  public terminatePlugin(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return;
    }

    plugin.bridge.disconnect();
    plugin.sandbox.terminate();
    this.plugins.delete(pluginId);

    this.log('warn', `Plugin ${pluginId} forcefully terminated`);
  }

  /**
   * Checks if a plugin is loaded.
   */
  public isPluginLoaded(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Gets the current state of a plugin.
   */
  public getPluginState(pluginId: string): SandboxState | null {
    const plugin = this.plugins.get(pluginId);
    return plugin ? plugin.sandbox.getState() : null;
  }

  /**
   * Gets a list of all loaded plugin IDs.
   */
  public getLoadedPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }

  // ── Event Broadcasting ──────────────────────────────────────────────────

  /**
   * Broadcasts an event to all running plugins that have the required permission.
   *
   * @param namespace - Event namespace
   * @param event - Event name
   * @param data - Event data (must be structured-cloneable)
   * @param targetPermission - Permission required to receive this event
   */
  public broadcastEvent(
    namespace: string,
    event: string,
    data: unknown,
    targetPermission?: SandboxPermission
  ): void {
    for (const [pluginId, plugin] of this.plugins) {
      // Only send to running plugins
      if (plugin.sandbox.getState() !== 'running') {
        continue;
      }

      // Check permission if specified
      if (targetPermission && !plugin.sandbox.hasPermission(targetPermission)) {
        continue;
      }

      plugin.sandbox.sendEvent(namespace, event, data);
    }
  }

  /**
   * Sends an event to a specific plugin.
   */
  public sendEventToPlugin(
    pluginId: string,
    namespace: string,
    event: string,
    data: unknown
  ): void {
    const plugin = this.plugins.get(pluginId);
    if (plugin && plugin.sandbox.getState() === 'running') {
      plugin.sandbox.sendEvent(namespace, event, data);
    }
  }

  // ── Health & Monitoring ─────────────────────────────────────────────────

  /**
   * Gets health metrics for a specific plugin.
   */
  public getPluginHealth(pluginId: string): SandboxHealthMetrics | null {
    const plugin = this.plugins.get(pluginId);
    return plugin ? plugin.sandbox.getHealthMetrics() : null;
  }

  /**
   * Gets a health summary for all plugins.
   */
  public getHealthSummary(): PluginHostHealthSummary {
    const summary: PluginHostHealthSummary = {
      totalPlugins: this.plugins.size,
      byState: {
        creating: 0,
        loading: 0,
        initializing: 0,
        ready: 0,
        running: 0,
        suspended: 0,
        error: 0,
        terminated: 0,
      },
      pluginsWithViolations: [],
      totalAuditEntries: 0,
      plugins: {},
    };

    for (const [pluginId, plugin] of this.plugins) {
      const metrics = plugin.sandbox.getHealthMetrics();
      summary.plugins[pluginId] = metrics;
      summary.byState[metrics.state]++;
      summary.totalAuditEntries += plugin.sandbox.getAuditLog().length;

      if (metrics.permissionViolations > 0) {
        summary.pluginsWithViolations.push(pluginId);
      }
    }

    return summary;
  }

  /**
   * Gets audit logs for a specific plugin.
   */
  public getPluginAuditLog(pluginId: string): SandboxAuditEntry[] {
    const plugin = this.plugins.get(pluginId);
    return plugin ? plugin.sandbox.getAuditLog() : [];
  }

  /**
   * Gets combined audit logs for all plugins, sorted by timestamp.
   */
  public getAllAuditLogs(): SandboxAuditEntry[] {
    const allLogs: SandboxAuditEntry[] = [];
    for (const [, plugin] of this.plugins) {
      allLogs.push(...plugin.sandbox.getAuditLog());
    }
    return allLogs.sort((a, b) => a.timestamp - b.timestamp);
  }

  // ── Shutdown ────────────────────────────────────────────────────────────

  /**
   * Gracefully shuts down all plugins.
   * Call this when Studio is closing.
   */
  public async shutdown(): Promise<void> {
    this.stopMonitoring();

    this.log('info', `Shutting down ${this.plugins.size} plugins...`);

    const shutdownPromises = Array.from(this.plugins.keys()).map((pluginId) =>
      this.unloadPlugin(pluginId, 'studio-closing').catch((err) => {
        this.log('warn', `Error shutting down plugin ${pluginId}:`, err);
        // Force terminate on error
        this.terminatePlugin(pluginId);
      })
    );

    await Promise.allSettled(shutdownPromises);

    this.log('info', 'All plugins shut down');
  }

  // ── Private Methods ─────────────────────────────────────────────────────

  /**
   * Starts the health monitoring interval.
   */
  private startMonitoring(): void {
    if (this.options.monitorInterval <= 0) {
      return;
    }

    this.monitorTimer = setInterval(() => {
      this.checkPluginHealth();
    }, this.options.monitorInterval);
  }

  /**
   * Stops the health monitoring interval.
   */
  private stopMonitoring(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  /**
   * Checks health of all plugins and takes action on problematic ones.
   */
  private checkPluginHealth(): void {
    for (const [pluginId, plugin] of this.plugins) {
      const metrics = plugin.sandbox.getHealthMetrics();

      // Check for error state
      if (metrics.state === 'error') {
        this.log('warn', `Plugin ${pluginId} is in error state`);
        // Could auto-restart or notify user
      }

      // Check for excessive permission violations (potential attack)
      if (metrics.permissionViolations > 50) {
        this.log(
          'error',
          `Plugin ${pluginId} has ${metrics.permissionViolations} permission violations - terminating`
        );
        this.terminatePlugin(pluginId);
      }

      // Check for high latency (potential resource hog)
      if (metrics.avgLatencyMs > 1000) {
        this.log('warn', `Plugin ${pluginId} has high average latency: ${metrics.avgLatencyMs}ms`);
      }

      // Check for memory budget (if available)
      const memoryBudget = plugin.options.manifest.memoryBudget ?? 64;
      if (metrics.memoryEstimate && metrics.memoryEstimate > memoryBudget * 1024 * 1024) {
        this.log(
          'warn',
          `Plugin ${pluginId} exceeds memory budget (${Math.round(metrics.memoryEstimate / 1024 / 1024)}MB > ${memoryBudget}MB)`
        );
      }
    }
  }

  /**
   * Logs messages.
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    if (level === 'debug' && !this.options.debug) {
      return;
    }

    const prefix = '[SandboxedPluginHost]';
    switch (level) {
      case 'debug':
        console.debug(prefix, message, data ?? '');
        break;
      case 'info':
        console.info(prefix, message, data ?? '');
        break;
      case 'warn':
        console.warn(prefix, message, data ?? '');
        break;
      case 'error':
        console.error(prefix, message, data ?? '');
        break;
    }
  }
}
