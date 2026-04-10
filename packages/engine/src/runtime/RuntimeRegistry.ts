/**
 * RuntimeRegistry.ts
 *
 * Central registry for HoloScript runtime modules.
 * Allows Hololand to discover and execute runtimes dynamically.
 */

import type { HoloComposition } from '@holoscript/core';

export interface RuntimeModule {
  /** Runtime identifier */
  id: string;

  /** Runtime name */
  name: string;

  /** Runtime version */
  version: string;

  /** Supported composition types */
  supportedTypes: string[];

  /** Initialize runtime from composition */
  initialize(composition: HoloComposition, config?: any): RuntimeExecutor;

  /** Runtime capabilities */
  capabilities: RuntimeCapabilities;

  /** Runtime metadata */
  metadata: RuntimeMetadata;
}

export interface RuntimeExecutor {
  /** Start execution */
  start(): void;

  /** Stop execution */
  stop(): void;

  /** Pause execution */
  pause(): void;

  /** Resume execution */
  resume(): void;

  /** Update runtime (called per frame) */
  update(dt: number): void;

  /** Get runtime statistics */
  getStatistics(): any;

  /** Get runtime state */
  getState(): any;

  /** Reset runtime */
  reset(): void;
}

export interface RuntimeCapabilities {
  /** Physics simulation */
  physics?: {
    gravity: boolean;
    collision: boolean;
    constraints: boolean;
    softBody: boolean;
    fluids: boolean;
  };

  /** Rendering capabilities */
  rendering?: {
    particles: boolean;
    lighting: boolean;
    shadows: boolean;
    postProcessing: boolean;
  };

  /** Interaction capabilities */
  interaction?: {
    userInput: boolean;
    gestures: boolean;
    voice: boolean;
    haptics: boolean;
  };

  /** Platform support */
  platforms?: string[];

  /** Performance metrics */
  performance?: {
    maxEntities: number;
    maxParticles: number;
    targetFPS: number;
  };
}

export interface RuntimeMetadata {
  /** Author */
  author?: string;

  /** Description */
  description?: string;

  /** Documentation URL */
  documentation?: string;

  /** Repository URL */
  repository?: string;

  /** License */
  license?: string;

  /** Tags */
  tags?: string[];
}

/**
 * Runtime Registry - Central registry for all HoloScript runtimes
 */
class RuntimeRegistryClass {
  private runtimes = new Map<string, RuntimeModule>();

  /**
   * Register a runtime module
   */
  register(runtime: RuntimeModule): void {
    if (this.runtimes.has(runtime.id)) {
      // Runtime already registered, overwriting
    }

    this.runtimes.set(runtime.id, runtime);
  }

  /**
   * Unregister a runtime module
   */
  unregister(runtimeId: string): boolean {
    const existed = this.runtimes.delete(runtimeId);

    if (existed) {
      // Runtime unregistered
    }

    return existed;
  }

  /**
   * Get runtime by ID
   */
  get(runtimeId: string): RuntimeModule | undefined {
    return this.runtimes.get(runtimeId);
  }

  /**
   * Check if runtime is registered
   */
  has(runtimeId: string): boolean {
    return this.runtimes.has(runtimeId);
  }

  /**
   * Get all registered runtimes
   */
  getAll(): RuntimeModule[] {
    return Array.from(this.runtimes.values());
  }

  /**
   * Get runtime IDs
   */
  getIds(): string[] {
    return Array.from(this.runtimes.keys());
  }

  /**
   * Find runtimes by type
   */
  findByType(type: string): RuntimeModule[] {
    return Array.from(this.runtimes.values()).filter((runtime) =>
      runtime.supportedTypes.includes(type)
    );
  }

  /**
   * Find runtimes by capability
   */
  findByCapability(capability: string): RuntimeModule[] {
    return Array.from(this.runtimes.values()).filter((runtime) => {
      // Check if runtime has the specified capability
      const caps = runtime.capabilities;

      if (capability === 'physics') return !!caps.physics;
      if (capability === 'particles') return !!caps.rendering?.particles;
      if (capability === 'fluids') return !!caps.physics?.fluids;
      if (capability === 'userInput') return !!caps.interaction?.userInput;

      return false;
    });
  }

  /**
   * Find runtimes by tag
   */
  findByTag(tag: string): RuntimeModule[] {
    return Array.from(this.runtimes.values()).filter((runtime) =>
      runtime.metadata.tags?.includes(tag)
    );
  }

  /**
   * Execute composition with appropriate runtime
   */
  execute(composition: HoloComposition, config?: any): RuntimeExecutor | null {
    // Find runtime that supports this composition type
    const compatibleRuntimes = this.findByType(composition.type || 'scene');

    if (compatibleRuntimes.length === 0) {
      return null;
    }

    // Use first compatible runtime (could be smarter about selection)
    const runtime = compatibleRuntimes[0];

    return runtime.initialize(composition, config);
  }

  /**
   * Get registry statistics
   */
  getStatistics() {
    return {
      totalRuntimes: this.runtimes.size,
      runtimes: Array.from(this.runtimes.values()).map((runtime) => ({
        id: runtime.id,
        name: runtime.name,
        version: runtime.version,
        types: runtime.supportedTypes,
        tags: runtime.metadata.tags || [],
      })),
    };
  }

  /**
   * Clear all runtimes (mainly for testing)
   */
  clear(): void {
    this.runtimes.clear();
  }
}

// Export singleton instance
export const RuntimeRegistry = new RuntimeRegistryClass();

/**
 * Decorator for registering runtime modules
 */
export function registerRuntime(runtime: RuntimeModule) {
  RuntimeRegistry.register(runtime);
  return runtime;
}

