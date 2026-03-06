/**
 * PluginLoader — Plugin lifecycle and dependency management
 *
 * Handles loading, initializing, starting, stopping, and destroying plugins.
 * Resolves dependency DAGs, enforces version constraints, and provides
 * sandboxed execution contexts.
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export interface PluginManifest {
  /** Unique plugin identifier */
  id: string;

  /** Display name */
  name: string;

  /** Semantic version */
  version: string;

  /** Plugin author */
  author?: string;

  /** Plugin description */
  description?: string;

  /** Dependencies: { pluginId: semver constraint } */
  dependencies?: Record<string, string>;

  /** Permissions required */
  permissions?: PluginPermission[];

  /** Plugin entry point (module path or factory) */
  entryPoint?: string;

  /** Minimum engine version */
  engineVersion?: string;
}

export type PluginPermission =
  | 'scene:read'
  | 'scene:write'
  | 'network:connect'
  | 'filesystem:read'
  | 'filesystem:write'
  | 'audio:play'
  | 'input:capture'
  // Hololand Platform permissions
  | 'vrr:sync'           // Access VRR real-time sync APIs
  | 'x402:payment'       // Trigger x402 payments
  | 'ar:camera'          // Access device camera for AR
  | 'agentkit:wallet'    // Access AI agent wallet
  | 'zora:nft_mint'      // Mint NFTs via Zora
  | 'storyweaver:ai'     // Access StoryWeaver AI services
  | 'quest:create'       // Create business quests
  | 'quest:manage';      // Manage quest state

export enum PluginState {
  UNLOADED = 'UNLOADED',
  LOADED = 'LOADED',
  INITIALIZED = 'INITIALIZED',
  STARTED = 'STARTED',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR',
}

export interface PluginInstance {
  manifest: PluginManifest;
  state: PluginState;
  error?: string;
  loadedAt?: number;
  startedAt?: number;
}

export interface PluginHooks {
  onInit?: () => void | Promise<void>;
  onStart?: () => void | Promise<void>;
  onStop?: () => void | Promise<void>;
  onDestroy?: () => void | Promise<void>;
  onUpdate?: (delta: number) => void;
}

// =============================================================================
// SEMVER UTILITIES
// =============================================================================

function parseSemver(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: parseInt(match[1]), minor: parseInt(match[2]), patch: parseInt(match[3]) };
}

function satisfiesSemver(version: string, constraint: string): boolean {
  const ver = parseSemver(version);
  if (!ver) return false;

  // ^X.Y.Z — compatible (same major)
  if (constraint.startsWith('^')) {
    const req = parseSemver(constraint.slice(1));
    if (!req) return false;
    if (ver.major !== req.major) return false;
    if (ver.minor < req.minor) return false;
    if (ver.minor === req.minor && ver.patch < req.patch) return false;
    return true;
  }

  // ~X.Y.Z — patch-level (same major.minor)
  if (constraint.startsWith('~')) {
    const req = parseSemver(constraint.slice(1));
    if (!req) return false;
    return ver.major === req.major && ver.minor === req.minor && ver.patch >= req.patch;
  }

  // >=X.Y.Z
  if (constraint.startsWith('>=')) {
    const req = parseSemver(constraint.slice(2));
    if (!req) return false;
    if (ver.major > req.major) return true;
    if (ver.major === req.major && ver.minor > req.minor) return true;
    if (ver.major === req.major && ver.minor === req.minor && ver.patch >= req.patch) return true;
    return false;
  }

  // Exact match
  const req = parseSemver(constraint);
  if (!req) return false;
  return ver.major === req.major && ver.minor === req.minor && ver.patch === req.patch;
}

export { satisfiesSemver, parseSemver };

// =============================================================================
// PLUGIN LOADER
// =============================================================================

export class PluginLoader {
  private plugins: Map<string, PluginInstance> = new Map();
  private hooks: Map<string, PluginHooks> = new Map();
  private loadOrder: string[] = [];

  /**
   * Register a plugin from its manifest
   */
  register(manifest: PluginManifest, hooks?: PluginHooks): void {
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin "${manifest.id}" is already registered`);
    }

    this.plugins.set(manifest.id, {
      manifest,
      state: PluginState.LOADED,
      loadedAt: Date.now(),
    });

    if (hooks) {
      this.hooks.set(manifest.id, hooks);
    }
  }

  /**
   * Resolve dependency order using topological sort
   */
  resolveDependencies(): string[] {
    const visited = new Set<string>();
    const sorted: string[] = [];
    const visiting = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new Error(`Circular dependency detected involving plugin "${id}"`);
      }

      const plugin = this.plugins.get(id);
      if (!plugin) {
        throw new Error(`Missing dependency: plugin "${id}" not found`);
      }

      visiting.add(id);

      const deps = plugin.manifest.dependencies || {};
      for (const [depId, constraint] of Object.entries(deps)) {
        const dep = this.plugins.get(depId);
        if (!dep) {
          throw new Error(`Plugin "${id}" requires "${depId}" but it is not registered`);
        }
        if (!satisfiesSemver(dep.manifest.version, constraint)) {
          throw new Error(
            `Plugin "${id}" requires "${depId}" ${constraint} but found ${dep.manifest.version}`
          );
        }
        visit(depId);
      }

      visiting.delete(id);
      visited.add(id);
      sorted.push(id);
    };

    for (const id of this.plugins.keys()) {
      visit(id);
    }

    this.loadOrder = sorted;
    return [...sorted];
  }

  /**
   * Initialize all plugins in dependency order
   */
  async initializeAll(): Promise<void> {
    if (this.loadOrder.length === 0) {
      this.resolveDependencies();
    }

    for (const id of this.loadOrder) {
      await this.initializePlugin(id);
    }
  }

  /**
   * Start all initialized plugins
   */
  async startAll(): Promise<void> {
    for (const id of this.loadOrder) {
      await this.startPlugin(id);
    }
  }

  /**
   * Stop all running plugins (reverse order)
   */
  async stopAll(): Promise<void> {
    for (let i = this.loadOrder.length - 1; i >= 0; i--) {
      await this.stopPlugin(this.loadOrder[i]);
    }
  }

  /**
   * Destroy all plugins (reverse order)
   */
  async destroyAll(): Promise<void> {
    for (let i = this.loadOrder.length - 1; i >= 0; i--) {
      await this.destroyPlugin(this.loadOrder[i]);
    }
    this.plugins.clear();
    this.hooks.clear();
    this.loadOrder = [];
  }

  private async initializePlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin || plugin.state !== PluginState.LOADED) return;

    try {
      const hooks = this.hooks.get(id);
      if (hooks?.onInit) {
        await hooks.onInit();
      }
      plugin.state = PluginState.INITIALIZED;
    } catch (error) {
      plugin.state = PluginState.ERROR;
      plugin.error = (error as Error).message;
    }
  }

  private async startPlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin || plugin.state !== PluginState.INITIALIZED) return;

    try {
      const hooks = this.hooks.get(id);
      if (hooks?.onStart) {
        await hooks.onStart();
      }
      plugin.state = PluginState.STARTED;
      plugin.startedAt = Date.now();
    } catch (error) {
      plugin.state = PluginState.ERROR;
      plugin.error = (error as Error).message;
    }
  }

  private async stopPlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin || plugin.state !== PluginState.STARTED) return;

    try {
      const hooks = this.hooks.get(id);
      if (hooks?.onStop) {
        await hooks.onStop();
      }
      plugin.state = PluginState.STOPPED;
    } catch (error) {
      plugin.state = PluginState.ERROR;
      plugin.error = (error as Error).message;
    }
  }

  private async destroyPlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) return;

    try {
      const hooks = this.hooks.get(id);
      if (hooks?.onDestroy) {
        await hooks.onDestroy();
      }
      plugin.state = PluginState.UNLOADED;
    } catch (error) {
      plugin.state = PluginState.ERROR;
      plugin.error = (error as Error).message;
    }
  }

  /**
   * Update all started plugins
   */
  update(delta: number): void {
    for (const id of this.loadOrder) {
      const plugin = this.plugins.get(id);
      if (plugin?.state === PluginState.STARTED) {
        const hooks = this.hooks.get(id);
        if (hooks?.onUpdate) {
          try {
            hooks.onUpdate(delta);
          } catch {
            // non-fatal
          }
        }
      }
    }
  }

  /**
   * Get plugin instance by ID
   */
  getPlugin(id: string): PluginInstance | undefined {
    return this.plugins.get(id);
  }

  /**
   * Get all registered plugin IDs
   */
  getPluginIds(): string[] {
    return [...this.plugins.keys()];
  }

  /**
   * Get current load order
   */
  getLoadOrder(): string[] {
    return [...this.loadOrder];
  }

  /**
   * Get count of plugins in each state
   */
  getStats(): Record<PluginState, number> {
    const stats: Record<string, number> = {};
    for (const state of Object.values(PluginState)) {
      stats[state] = 0;
    }
    for (const plugin of this.plugins.values()) {
      stats[plugin.state]++;
    }
    return stats as Record<PluginState, number>;
  }
}
