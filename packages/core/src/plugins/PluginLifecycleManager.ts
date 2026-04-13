/**
 * PluginLifecycleManager — Unified plugin lifecycle orchestrator
 *
 * Composes PluginSandboxRunner + PluginSignatureVerifier + DependencyResolver
 * into a single coherent lifecycle:
 *
 *   install → verify → sandbox → enable → disable → uninstall
 *
 * Emits telemetry events at each lifecycle transition.
 *
 * Part of HoloScript v5.7 "Open Ecosystem".
 *
 * @version 1.0.0
 */

import type { TelemetryCollector } from '../debug/TelemetryCollector';
import type { SignedPackage } from '@holoscript/platform';
import {
  PluginSandboxRunner,
  DEFAULT_CAPABILITY_BUDGET,
  type PluginSandboxRunnerConfig,
  type SandboxPermission,
  type CapabilityBudget,
} from './PluginSandboxRunner';
import { PluginSignatureVerifier, type VerificationResult } from './PluginSignatureVerifier';
import { DependencyResolver, type PluginEntry, type ResolutionResult } from './DependencyResolver';

// =============================================================================
// TYPES
// =============================================================================

export type PluginLifecycleState =
  | 'uninstalled'
  | 'installed'
  | 'verified'
  | 'sandboxed'
  | 'enabled'
  | 'disabled'
  | 'error';

/**
 * Managed plugin with lifecycle state.
 */
export interface ManagedPlugin {
  /** Plugin ID */
  id: string;
  /** Plugin name */
  name: string;
  /** Plugin version */
  version: string;
  /** Plugin description */
  description: string;
  /** Current lifecycle state */
  state: PluginLifecycleState;
  /** Sandbox runner (created when sandboxed) */
  sandbox?: PluginSandboxRunner;
  /** Signature verification result */
  verification?: VerificationResult;
  /** Plugin code (for sandbox execution) */
  code?: string;
  /** Error message if in error state */
  error?: string;
  /** When the plugin was installed */
  installedAt: string;
  /** Permissions granted */
  permissions: SandboxPermission[];
  /** Dependencies */
  dependencies: Record<string, string>;
}

/**
 * Options for installing a plugin.
 */
export interface InstallPluginOptions {
  /** Plugin ID */
  id: string;
  /** Plugin name */
  name: string;
  /** Plugin version */
  version: string;
  /** Plugin description */
  description: string;
  /** Plugin source code */
  code: string;
  /** Signed package (optional, for verification) */
  signedPackage?: SignedPackage;
  /** Permissions requested */
  permissions?: SandboxPermission[];
  /** Dependencies */
  dependencies?: Record<string, string>;
  /** Custom capability budget */
  budget?: Partial<CapabilityBudget>;
}

/**
 * Configuration for the lifecycle manager.
 */
export interface LifecycleManagerConfig {
  /** Whether signature verification is required */
  requireSignature: boolean;
  /** Default capability budget for plugins */
  defaultBudget: CapabilityBudget;
  /** Maximum number of installed plugins */
  maxPlugins: number;
  /** Telemetry collector */
  telemetry?: TelemetryCollector;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

export const DEFAULT_LIFECYCLE_CONFIG: LifecycleManagerConfig = {
  requireSignature: false,
  defaultBudget: DEFAULT_CAPABILITY_BUDGET,
  maxPlugins: 50,
};

// =============================================================================
// PLUGIN LIFECYCLE MANAGER
// =============================================================================

export class PluginLifecycleManager {
  private plugins: Map<string, ManagedPlugin> = new Map();
  private config: LifecycleManagerConfig;
  private verifier: PluginSignatureVerifier;
  private resolver: DependencyResolver;
  private telemetry?: TelemetryCollector;

  constructor(config?: Partial<LifecycleManagerConfig>, verifier?: PluginSignatureVerifier) {
    this.config = { ...DEFAULT_LIFECYCLE_CONFIG, ...config };
    this.telemetry = this.config.telemetry;
    this.verifier =
      verifier ||
      new PluginSignatureVerifier({
        requireSignature: this.config.requireSignature,
      });
    this.resolver = new DependencyResolver();
  }

  // ===========================================================================
  // LIFECYCLE: INSTALL
  // ===========================================================================

  /**
   * Install a plugin. Validates manifest, checks limits, and registers.
   */
  install(options: InstallPluginOptions): ManagedPlugin {
    if (this.plugins.has(options.id)) {
      throw new Error(`Plugin "${options.id}" is already installed`);
    }

    if (this.plugins.size >= this.config.maxPlugins) {
      throw new Error(`Plugin limit reached (${this.config.maxPlugins})`);
    }

    // Validate ID format
    if (!/^[a-z0-9][a-z0-9-]*$/.test(options.id)) {
      throw new Error(`Invalid plugin ID: "${options.id}" (must be kebab-case)`);
    }

    const plugin: ManagedPlugin = {
      id: options.id,
      name: options.name,
      version: options.version,
      description: options.description,
      state: 'installed',
      code: options.code,
      installedAt: new Date().toISOString(),
      permissions: options.permissions || [],
      dependencies: options.dependencies || {},
    };

    this.plugins.set(options.id, plugin);

    // Register in dependency resolver
    this.resolver.addPlugin({
      id: options.id,
      version: options.version,
      dependencies: options.dependencies || {},
    });

    this.emitTelemetry('plugin_installed', options.id, { version: options.version });
    return plugin;
  }

  // ===========================================================================
  // LIFECYCLE: VERIFY
  // ===========================================================================

  /**
   * Verify a plugin's signature. Requires a signed package.
   */
  verify(pluginId: string, signedPackage: SignedPackage): VerificationResult {
    const plugin = this.requirePlugin(pluginId);

    const result = this.verifier.verifyPlugin(signedPackage);
    plugin.verification = result;

    if (result.verified) {
      plugin.state = 'verified';
      this.emitTelemetry('plugin_verified', pluginId, { keyId: result.keyId });
    } else {
      plugin.state = 'error';
      plugin.error = result.error;
      this.emitTelemetry('plugin_verification_failed', pluginId, { error: result.error });
    }

    return result;
  }

  /**
   * Skip verification (for development/trusted plugins).
   */
  skipVerification(pluginId: string): void {
    const plugin = this.requirePlugin(pluginId);
    if (this.config.requireSignature) {
      throw new Error('Cannot skip verification: signatures are required');
    }
    plugin.state = 'verified';
    plugin.verification = {
      verified: true,
      verifiedAt: new Date().toISOString(),
      packageName: plugin.name,
      packageVersion: plugin.version,
      keyLabel: 'skipped',
    };
  }

  // ===========================================================================
  // LIFECYCLE: SANDBOX
  // ===========================================================================

  /**
   * Create a sandboxed execution environment for a verified plugin.
   */
  sandbox(pluginId: string, budget?: Partial<CapabilityBudget>): PluginSandboxRunner {
    const plugin = this.requirePlugin(pluginId);

    if (plugin.state !== 'verified' && plugin.state !== 'installed') {
      throw new Error(
        `Plugin "${pluginId}" must be verified before sandboxing (current: ${plugin.state})`
      );
    }

    const config: PluginSandboxRunnerConfig = {
      pluginId,
      permissions: new Set(plugin.permissions),
      budget: { ...this.config.defaultBudget, ...budget },
      telemetry: this.telemetry,
    };

    const runner = new PluginSandboxRunner(config);
    plugin.sandbox = runner;
    plugin.state = 'sandboxed';

    this.emitTelemetry('plugin_sandboxed', pluginId);
    return runner;
  }

  // ===========================================================================
  // LIFECYCLE: ENABLE / DISABLE
  // ===========================================================================

  /**
   * Enable a sandboxed plugin by executing its code.
   */
  async enable(pluginId: string): Promise<{ success: boolean; error?: string }> {
    const plugin = this.requirePlugin(pluginId);

    if (plugin.state !== 'sandboxed' && plugin.state !== 'disabled') {
      throw new Error(
        `Plugin "${pluginId}" must be sandboxed before enabling (current: ${plugin.state})`
      );
    }

    if (!plugin.sandbox) {
      throw new Error(`Plugin "${pluginId}" has no sandbox runner`);
    }

    if (!plugin.code) {
      throw new Error(`Plugin "${pluginId}" has no code to execute`);
    }

    const result = await plugin.sandbox.execute(plugin.code);

    if (result.success) {
      plugin.state = 'enabled';
      this.emitTelemetry('plugin_enabled', pluginId, {
        cpuTimeMs: result.cpuTimeMs,
        apiCalls: result.apiCalls,
      });
      return { success: true };
    } else {
      plugin.state = 'error';
      plugin.error = result.error;
      this.emitTelemetry('plugin_error', pluginId, { error: result.error });
      return { success: false, error: result.error };
    }
  }

  /**
   * Disable an enabled plugin.
   */
  disable(pluginId: string): void {
    const plugin = this.requirePlugin(pluginId);

    if (plugin.state !== 'enabled') {
      throw new Error(`Plugin "${pluginId}" is not enabled (current: ${plugin.state})`);
    }

    plugin.state = 'disabled';
    this.emitTelemetry('plugin_disabled', pluginId);
  }

  // ===========================================================================
  // LIFECYCLE: UNINSTALL
  // ===========================================================================

  /**
   * Uninstall a plugin, destroying its sandbox.
   */
  uninstall(pluginId: string): void {
    const plugin = this.requirePlugin(pluginId);

    // Check dependents
    const dependents = this.resolver.getDependents(pluginId);
    const activeDependents = dependents.filter((d) => {
      const p = this.plugins.get(d);
      return p && p.state !== 'uninstalled';
    });

    if (activeDependents.length > 0) {
      throw new Error(`Cannot uninstall "${pluginId}": required by ${activeDependents.join(', ')}`);
    }

    if (plugin.sandbox) {
      plugin.sandbox.destroy();
    }

    plugin.state = 'uninstalled';
    this.plugins.delete(pluginId);
    this.resolver.removePlugin(pluginId);

    this.emitTelemetry('plugin_uninstalled', pluginId);
  }

  // ===========================================================================
  // DEPENDENCY RESOLUTION
  // ===========================================================================

  /**
   * Resolve dependencies for all installed plugins.
   */
  resolveDependencies(): ResolutionResult {
    return this.resolver.resolve();
  }

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  getPlugin(pluginId: string): ManagedPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getAllPlugins(): ManagedPlugin[] {
    return [...this.plugins.values()];
  }

  getPluginsByState(state: PluginLifecycleState): ManagedPlugin[] {
    return [...this.plugins.values()].filter((p) => p.state === state);
  }

  getPluginCount(): number {
    return this.plugins.size;
  }

  getStats(): {
    total: number;
    byState: Record<string, number>;
    totalTools: number;
  } {
    const byState: Record<string, number> = {};
    let totalTools = 0;

    for (const plugin of this.plugins.values()) {
      byState[plugin.state] = (byState[plugin.state] || 0) + 1;
      if (plugin.sandbox) {
        totalTools += plugin.sandbox.getTools().length;
      }
    }

    return { total: this.plugins.size, byState, totalTools };
  }

  // ===========================================================================
  // INTERNAL HELPERS
  // ===========================================================================

  private requirePlugin(pluginId: string): ManagedPlugin {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin "${pluginId}" is not installed`);
    }
    return plugin;
  }

  private emitTelemetry(type: string, pluginId: string, data?: Record<string, unknown>): void {
    this.telemetry?.record({
      type,
      severity: type.includes('error') || type.includes('failed') ? 'error' : 'info',
      agentId: pluginId,
      data: { pluginId, ...data },
    });
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  /**
   * Destroy all plugins and reset the manager.
   */
  destroyAll(): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.sandbox) {
        plugin.sandbox.destroy();
      }
    }
    this.plugins.clear();
    this.resolver.clear();
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let defaultManager: PluginLifecycleManager | null = null;

export function getPluginLifecycleManager(
  config?: Partial<LifecycleManagerConfig>
): PluginLifecycleManager {
  if (!defaultManager) {
    defaultManager = new PluginLifecycleManager(config);
  }
  return defaultManager;
}

export function resetPluginLifecycleManager(): void {
  if (defaultManager) {
    defaultManager.destroyAll();
  }
  defaultManager = null;
}
